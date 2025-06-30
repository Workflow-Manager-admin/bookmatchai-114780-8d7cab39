import os
import json
import hashlib
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from dataclasses import dataclass
from enum import Enum

# Configure logging
logger = logging.getLogger(__name__)

class MatchType(Enum):
    """Types of semantic matching operations"""
    BOOK_TAGS = "book_tags"
    USER_INTERESTS = "user_interests"
    SWAP_COMPATIBILITY = "swap_compatibility"

@dataclass
class SemanticMatchResult:
    """Result of a semantic matching operation"""
    score: float
    explanation: str
    tags: List[str]
    cached: bool = False

class OpenRouterClient:
    """Client for OpenRouter LLM API integration"""
    
    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.base_url = "https://openrouter.ai/api/v1"
        self.model = "mistralai/mistral-7b-instruct:free"  # Free tier model
        self.cache_ttl_hours = 24 * 7  # Cache for 1 week
        
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not found in environment variables")
    
    def _generate_cache_key(self, content: str, operation_type: MatchType) -> str:
        """Generate a cache key for the given content and operation"""
        content_hash = hashlib.md5(content.encode()).hexdigest()
        return f"semantic_cache:{operation_type.value}:{content_hash}"
    
    def _is_cache_valid(self, cached_at: datetime) -> bool:
        """Check if cached data is still valid"""
        return datetime.utcnow() - cached_at < timedelta(hours=self.cache_ttl_hours)
    
    async def _call_openrouter_api(self, prompt: str) -> Optional[str]:
        """Make API call to OpenRouter"""
        if not self.api_key:
            logger.error("OpenRouter API key not configured")
            return None
            
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://bookswap-plus.app",  # Required for some free models
            "X-Title": "BookSwap+ Semantic Matching"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 500,
            "temperature": 0.3,  # Lower temperature for more consistent results
            "top_p": 0.9
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                
                data = response.json()
                if "choices" in data and len(data["choices"]) > 0:
                    return data["choices"][0]["message"]["content"].strip()
                else:
                    logger.error(f"Unexpected API response format: {data}")
                    return None
                    
        except httpx.TimeoutException:
            logger.error("OpenRouter API request timed out")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter API HTTP error: {e.response.status_code} - {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"OpenRouter API call failed: {str(e)}")
            return None

    async def generate_book_tags(self, title: str, author: str, description: str, db: Session) -> List[str]:
        """
        Generate semantic tags for a book using LLM with caching
        
        Args:
            title: Book title
            author: Book author
            description: Book description
            db: Database session for caching
            
        Returns:
            List of semantic tags
        """
        # Create content for hashing and LLM processing
        content = f"Title: {title}\nAuthor: {author}\nDescription: {description}"
        cache_key = self._generate_cache_key(content, MatchType.BOOK_TAGS)
        
        # Check cache first
        cached_result = await self._get_cached_result(cache_key, db)
        if cached_result:
            logger.info(f"Using cached tags for book: {title}")
            return json.loads(cached_result.get("tags", "[]"))
        
        # Generate new tags using LLM
        prompt = f"""
Analyze this book and extract 5-10 semantic tags that capture its themes, genres, mood, and appeal.
Focus on what readers who enjoy this book would be interested in.

Book Information:
Title: {title}
Author: {author}
Description: {description}

Instructions:
- Return ONLY a JSON array of strings
- Include themes, genres, moods, target audience
- Use specific, descriptive tags (not just "fiction" or "non-fiction")
- Examples: ["coming-of-age", "psychological-thriller", "historical-romance", "self-help", "environmental-activism"]

JSON Response:
"""
        
        llm_response = await self._call_openrouter_api(prompt)
        if not llm_response:
            # Fallback to basic tags if LLM fails
            logger.warning(f"LLM failed for book tags, using fallback for: {title}")
            return self._generate_fallback_tags(title, author, description)
        
        try:
            # Parse JSON response
            tags = json.loads(llm_response)
            if isinstance(tags, list) and all(isinstance(tag, str) for tag in tags):
                # Cache the result
                await self._cache_result(cache_key, {"tags": json.dumps(tags)}, db)
                logger.info(f"Generated {len(tags)} tags for book: {title}")
                return tags
            else:
                raise ValueError("Invalid tag format")
                
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse LLM response for book tags: {e}")
            return self._generate_fallback_tags(title, author, description)

    async def calculate_match_score(
        self, 
        user_interests: List[str], 
        book_tags: List[str], 
        book_title: str,
        db: Session
    ) -> SemanticMatchResult:
        """
        Calculate semantic match score between user interests and book
        
        Args:
            user_interests: List of user interest tags
            book_tags: List of book semantic tags
            book_title: Title of the book for context
            db: Database session for caching
            
        Returns:
            SemanticMatchResult with score and explanation
        """
        # Create content for caching
        content = f"Interests: {','.join(sorted(user_interests))}\nTags: {','.join(sorted(book_tags))}\nTitle: {book_title}"
        cache_key = self._generate_cache_key(content, MatchType.SWAP_COMPATIBILITY)
        
        # Check cache
        cached_result = await self._get_cached_result(cache_key, db)
        if cached_result:
            return SemanticMatchResult(
                score=float(cached_result.get("score", 0.0)),
                explanation=cached_result.get("explanation", ""),
                tags=json.loads(cached_result.get("matching_tags", "[]")),
                cached=True
            )
        
        # Generate match score using LLM
        prompt = f"""
Analyze the compatibility between a user's interests and a book's characteristics.
Provide a match score from 0.0 to 1.0 and explain the reasoning.

User Interests: {', '.join(user_interests)}
Book Tags: {', '.join(book_tags)}
Book Title: {book_title}

Instructions:
- Score 0.0-0.3: Poor match (very different interests)
- Score 0.4-0.6: Moderate match (some overlap)
- Score 0.7-0.9: Good match (strong alignment)
- Score 0.9-1.0: Excellent match (perfect alignment)

Return ONLY a JSON object with this exact format:
{{
    "score": 0.85,
    "explanation": "Strong match because both focus on...",
    "matching_tags": ["tag1", "tag2", "tag3"]
}}
"""
        
        llm_response = await self._call_openrouter_api(prompt)
        if not llm_response:
            # Fallback calculation
            return self._calculate_fallback_match(user_interests, book_tags, book_title)
        
        try:
            result_data = json.loads(llm_response)
            score = float(result_data.get("score", 0.0))
            explanation = result_data.get("explanation", "Match calculated using semantic analysis")
            matching_tags = result_data.get("matching_tags", [])
            
            # Ensure score is in valid range
            score = max(0.0, min(1.0, score))
            
            # Cache the result
            cache_data = {
                "score": score,
                "explanation": explanation,
                "matching_tags": json.dumps(matching_tags)
            }
            await self._cache_result(cache_key, cache_data, db)
            
            return SemanticMatchResult(
                score=score,
                explanation=explanation,
                tags=matching_tags,
                cached=False
            )
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error(f"Failed to parse match score response: {e}")
            return self._calculate_fallback_match(user_interests, book_tags, book_title)

    def _generate_fallback_tags(self, title: str, author: str, description: str) -> List[str]:
        """Generate basic tags when LLM is unavailable"""
        tags = []
        
        # Extract keywords from title and description
        text = f"{title} {description}".lower()
        
        # Basic genre detection
        genre_keywords = {
            "romance": ["love", "relationship", "heart", "romance", "passion"],
            "mystery": ["mystery", "detective", "crime", "murder", "investigation"],
            "fantasy": ["magic", "dragon", "wizard", "fantasy", "quest", "kingdom"],
            "sci-fi": ["space", "future", "technology", "alien", "robot", "science"],
            "thriller": ["thriller", "suspense", "danger", "chase", "escape"],
            "historical": ["history", "historical", "century", "war", "ancient"],
            "biography": ["life", "biography", "memoir", "story", author.lower()],
            "self-help": ["guide", "how to", "improve", "success", "motivation"]
        }
        
        for genre, keywords in genre_keywords.items():
            if any(keyword in text for keyword in keywords):
                tags.append(genre)
        
        # Add basic tags if no genres found
        if not tags:
            tags = ["general-fiction", "literature"]
            
        return tags[:5]  # Limit to 5 fallback tags

    def _calculate_fallback_match(
        self, 
        user_interests: List[str], 
        book_tags: List[str], 
        book_title: str
    ) -> SemanticMatchResult:
        """Calculate basic match score when LLM is unavailable"""
        if not user_interests or not book_tags:
            return SemanticMatchResult(
                score=0.0,
                explanation="Insufficient data for matching",
                tags=[]
            )
        
        # Simple overlap calculation
        common_tags = set(user_interests) & set(book_tags)
        score = len(common_tags) / max(len(user_interests), len(book_tags))
        
        explanation = f"Basic compatibility score based on {len(common_tags)} shared interests"
        if common_tags:
            explanation += f": {', '.join(common_tags)}"
        
        return SemanticMatchResult(
            score=score,
            explanation=explanation,
            tags=list(common_tags)
        )

    async def _get_cached_result(self, cache_key: str, db: Session) -> Optional[Dict]:
        """Retrieve cached result from database"""
        try:
            # Query cache table (we'll create this table structure)
            query = text("""
                SELECT data, created_at 
                FROM semantic_cache 
                WHERE cache_key = :cache_key 
                AND created_at > :cutoff_time
            """)
            
            cutoff_time = datetime.utcnow() - timedelta(hours=self.cache_ttl_hours)
            result = db.execute(query, {
                "cache_key": cache_key,
                "cutoff_time": cutoff_time
            }).fetchone()
            
            if result:
                return json.loads(result.data)
                
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")
            
        return None

    async def _cache_result(self, cache_key: str, data: Dict, db: Session):
        """Store result in cache"""
        try:
            # Upsert cache entry
            query = text("""
                INSERT INTO semantic_cache (cache_key, data, created_at)
                VALUES (:cache_key, :data, :created_at)
                ON CONFLICT (cache_key) 
                DO UPDATE SET 
                    data = EXCLUDED.data,
                    created_at = EXCLUDED.created_at
            """)
            
            db.execute(query, {
                "cache_key": cache_key,
                "data": json.dumps(data),
                "created_at": datetime.utcnow()
            })
            db.commit()
            
        except Exception as e:
            logger.warning(f"Cache storage failed: {e}")


class SemanticMatchingService:
    """Main service for semantic matching operations"""
    
    def __init__(self):
        self.client = OpenRouterClient()
    
    # PUBLIC_INTERFACE
    async def enrich_book_with_semantic_data(
        self, 
        book_id: int, 
        title: str, 
        author: str, 
        description: str, 
        db: Session
    ) -> bool:
        """
        Enrich a book with semantic tags and prepare it for matching
        
        Args:
            book_id: Database ID of the book
            title: Book title
            author: Book author
            description: Book description
            db: Database session
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Generate semantic tags
            tags = await self.client.generate_book_tags(title, author, description, db)
            
            # Update book record with semantic data
            update_query = text("""
                UPDATE books 
                SET semantic_tags = :tags,
                    llm_summary = :summary,
                    updated_at = :updated_at
                WHERE id = :book_id
            """)
            
            # Create a brief summary (first 200 chars of description)
            summary = description[:200] + "..." if len(description) > 200 else description
            
            db.execute(update_query, {
                "book_id": book_id,
                "tags": json.dumps(tags),
                "summary": summary,
                "updated_at": datetime.utcnow()
            })
            db.commit()
            
            logger.info(f"Successfully enriched book {book_id} with {len(tags)} semantic tags")
            return True
            
        except Exception as e:
            logger.error(f"Failed to enrich book {book_id}: {e}")
            db.rollback()
            return False

    # PUBLIC_INTERFACE
    async def find_matching_books(
        self, 
        user_interests: List[str], 
        limit: int = 10,
        min_score: float = 0.4,
        db: Session = None
    ) -> List[Dict]:
        """
        Find books that match user interests using semantic analysis
        
        Args:
            user_interests: List of user interest tags
            limit: Maximum number of books to return
            min_score: Minimum match score threshold
            db: Database session
            
        Returns:
            List of matched books with scores
        """
        try:
            # Get books with semantic tags
            query = text("""
                SELECT id, title, author, description, semantic_tags, llm_summary
                FROM books 
                WHERE semantic_tags IS NOT NULL 
                AND semantic_tags != 'null'
                ORDER BY created_at DESC
                LIMIT :limit_multiplier
            """)
            
            # Get more books than needed to filter by score
            result = db.execute(query, {"limit_multiplier": limit * 3}).fetchall()
            
            matched_books = []
            for row in result:
                book_tags = json.loads(row.semantic_tags) if row.semantic_tags else []
                
                # Calculate match score
                match_result = await self.client.calculate_match_score(
                    user_interests, book_tags, row.title, db
                )
                
                if match_result.score >= min_score:
                    matched_books.append({
                        "id": row.id,
                        "title": row.title,
                        "author": row.author,
                        "description": row.description,
                        "semantic_tags": book_tags,
                        "match_score": match_result.score,
                        "match_explanation": match_result.explanation,
                        "matching_tags": match_result.tags
                    })
            
            # Sort by match score and limit results
            matched_books.sort(key=lambda x: x["match_score"], reverse=True)
            return matched_books[:limit]
            
        except Exception as e:
            logger.error(f"Failed to find matching books: {e}")
            return []

    # PUBLIC_INTERFACE  
    async def get_swap_compatibility_score(
        self,
        offered_book_id: int,
        requested_book_id: int,
        db: Session
    ) -> SemanticMatchResult:
        """
        Calculate compatibility score between two books for swap offers
        
        Args:
            offered_book_id: ID of book being offered
            requested_book_id: ID of book being requested
            db: Database session
            
        Returns:
            SemanticMatchResult with compatibility analysis
        """
        try:
            # Get both books' data
            query = text("""
                SELECT id, title, author, semantic_tags 
                FROM books 
                WHERE id IN (:offered_id, :requested_id)
            """)
            
            result = db.execute(query, {
                "offered_id": offered_book_id,
                "requested_id": requested_book_id
            }).fetchall()
            
            if len(result) != 2:
                return SemanticMatchResult(
                    score=0.0,
                    explanation="One or both books not found",
                    tags=[]
                )
            
            # Organize book data
            books = {row.id: row for row in result}
            offered_book = books[offered_book_id]
            requested_book = books[requested_book_id]
            
            offered_tags = json.loads(offered_book.semantic_tags) if offered_book.semantic_tags else []
            requested_tags = json.loads(requested_book.semantic_tags) if requested_book.semantic_tags else []
            
            # Calculate compatibility
            return await self.client.calculate_match_score(
                offered_tags, requested_tags, f"{offered_book.title} <-> {requested_book.title}", db
            )
            
        except Exception as e:
            logger.error(f"Failed to calculate swap compatibility: {e}")
            return SemanticMatchResult(
                score=0.0,
                explanation=f"Error calculating compatibility: {str(e)}",
                tags=[]
            )


# Global instance
semantic_service = SemanticMatchingService()
