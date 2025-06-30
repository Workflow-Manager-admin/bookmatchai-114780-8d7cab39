from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Annotated
from pydantic import BaseModel, Field
from datetime import datetime

from ..database import get_db
from ..models import Book, User
from ..auth.clerk_utils import verify_clerk_token, ClerkUserInfo
from ..semantic import semantic_service, SemanticMatchResult

router = APIRouter(
    prefix="/semantic",
    tags=["semantic-matching"],
    responses={404: {"description": "Not found"}},
)

# Type alias for authenticated user dependency
AuthenticatedUser = Annotated[ClerkUserInfo, Depends(verify_clerk_token)]


class BookMatchResponse(BaseModel):
    """Response model for book matching results"""
    id: int
    title: str
    author: str
    description: str
    semantic_tags: List[str]
    match_score: float = Field(..., ge=0.0, le=1.0, description="Match score from 0.0 to 1.0")
    match_explanation: str
    matching_tags: List[str]

    class Config:
        from_attributes = True


class SwapCompatibilityResponse(BaseModel):
    """Response model for swap compatibility analysis"""
    offered_book_id: int
    requested_book_id: int
    compatibility_score: float = Field(..., ge=0.0, le=1.0, description="Compatibility score from 0.0 to 1.0")
    explanation: str
    matching_themes: List[str]
    cached: bool


class BookEnrichmentRequest(BaseModel):
    """Request model for enriching books with semantic data"""
    book_ids: List[int] = Field(..., max_items=10, description="List of book IDs to enrich (max 10)")


class BookEnrichmentResponse(BaseModel):
    """Response model for book enrichment results"""
    enriched_count: int
    failed_count: int
    enriched_book_ids: List[int]
    failed_book_ids: List[int]


class UserInterestsRequest(BaseModel):
    """Request model for user interests"""
    interests: List[str] = Field(..., min_items=1, max_items=20, description="List of user interests (1-20 items)")


@router.post("/enrich-books", response_model=BookEnrichmentResponse)
async def enrich_books_with_semantic_data(
    request: BookEnrichmentRequest,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Enrich books with semantic tags and summaries using LLM analysis.
    This endpoint processes books to generate semantic tags that improve matching.
    
    Args:
        request: BookEnrichmentRequest containing book IDs to process
        user: Authenticated user (must own the books)
        db: Database session
        
    Returns:
        BookEnrichmentResponse: Summary of enrichment results
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get books owned by user
    books = db.query(Book).filter(
        Book.id.in_(request.book_ids),
        Book.owner_id == db_user.id
    ).all()

    if not books:
        raise HTTPException(
            status_code=404, 
            detail="No books found or you don't have permission to enrich these books"
        )

    enriched_ids = []
    failed_ids = []

    for book in books:
        try:
            success = await semantic_service.enrich_book_with_semantic_data(
                book.id, book.title, book.author, book.description or "", db
            )
            
            if success:
                enriched_ids.append(book.id)
            else:
                failed_ids.append(book.id)
                
        except Exception as e:
            failed_ids.append(book.id)

    return BookEnrichmentResponse(
        enriched_count=len(enriched_ids),
        failed_count=len(failed_ids),
        enriched_book_ids=enriched_ids,
        failed_book_ids=failed_ids
    )


@router.post("/recommendations", response_model=List[BookMatchResponse])
async def get_book_recommendations(
    request: UserInterestsRequest,
    user: AuthenticatedUser,
    limit: int = Query(10, ge=1, le=50, description="Maximum number of recommendations"),
    min_score: float = Query(0.4, ge=0.0, le=1.0, description="Minimum match score threshold"),
    db: Session = Depends(get_db)
):
    """
    Get personalized book recommendations based on user interests using semantic matching.
    
    Args:
        request: UserInterestsRequest containing user's interests
        user: Authenticated user
        limit: Maximum number of recommendations to return (1-50)
        min_score: Minimum match score threshold (0.0-1.0)
        db: Database session
        
    Returns:
        List[BookMatchResponse]: List of recommended books with match scores
    """
    # Get database user to exclude their own books
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        # Get semantic matches
        matches = await semantic_service.find_matching_books(
            user_interests=request.interests,
            limit=limit,
            min_score=min_score,
            db=db
        )

        # Filter out user's own books
        filtered_matches = [
            match for match in matches 
            if not db.query(Book).filter(
                Book.id == match["id"], 
                Book.owner_id == db_user.id
            ).first()
        ]

        # Convert to response models
        recommendations = []
        for match in filtered_matches:
            recommendations.append(BookMatchResponse(
                id=match["id"],
                title=match["title"],
                author=match["author"],
                description=match["description"],
                semantic_tags=match["semantic_tags"],
                match_score=match["match_score"],
                match_explanation=match["match_explanation"],
                matching_tags=match["matching_tags"]
            ))

        return recommendations

    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to generate recommendations: {str(e)}"
        )


@router.get("/swap-compatibility/{offered_book_id}/{requested_book_id}", 
           response_model=SwapCompatibilityResponse)
async def analyze_swap_compatibility(
    offered_book_id: int,
    requested_book_id: int,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Analyze compatibility between two books for a potential swap.
    This helps users understand how well their offered book matches 
    what they're requesting.
    
    Args:
        offered_book_id: ID of the book being offered
        requested_book_id: ID of the book being requested
        user: Authenticated user
        db: Database session
        
    Returns:
        SwapCompatibilityResponse: Compatibility analysis with score and explanation
    """
    # Verify books exist
    offered_book = db.query(Book).filter(Book.id == offered_book_id).first()
    requested_book = db.query(Book).filter(Book.id == requested_book_id).first()

    if not offered_book or not requested_book:
        raise HTTPException(status_code=404, detail="One or both books not found")

    try:
        # Calculate compatibility
        compatibility = await semantic_service.get_swap_compatibility_score(
            offered_book_id, requested_book_id, db
        )

        return SwapCompatibilityResponse(
            offered_book_id=offered_book_id,
            requested_book_id=requested_book_id,
            compatibility_score=compatibility.score,
            explanation=compatibility.explanation,
            matching_themes=compatibility.tags,
            cached=compatibility.cached
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze swap compatibility: {str(e)}"
        )


@router.get("/book-tags/{book_id}", response_model=List[str])
async def get_book_semantic_tags(
    book_id: int,
    db: Session = Depends(get_db)
):
    """
    Get semantic tags for a specific book.
    Public endpoint that returns the LLM-generated tags for any book.
    
    Args:
        book_id: ID of the book
        db: Database session
        
    Returns:
        List[str]: List of semantic tags for the book
    """
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if not book.semantic_tags:
        raise HTTPException(
            status_code=404, 
            detail="Book has not been processed for semantic tags yet"
        )

    try:
        import json
        tags = json.loads(book.semantic_tags) if isinstance(book.semantic_tags, str) else book.semantic_tags
        return tags
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=500,
            detail="Failed to parse semantic tags for this book"
        )


@router.post("/batch-recommendations", response_model=List[BookMatchResponse])
async def get_batch_recommendations_for_books(
    book_ids: List[int] = Query(..., description="Book IDs to get recommendations for"),
    user: AuthenticatedUser = Depends(verify_clerk_token),
    limit_per_book: int = Query(5, ge=1, le=20, description="Recommendations per book"),
    min_score: float = Query(0.5, ge=0.0, le=1.0, description="Minimum match score"),
    db: Session = Depends(get_db)
):
    """
    Get recommendations based on multiple books that a user is interested in.
    Useful for finding books similar to a collection or reading list.
    
    Args:
        book_ids: List of book IDs to base recommendations on
        user: Authenticated user
        limit_per_book: Maximum recommendations per source book
        min_score: Minimum match score threshold
        db: Database session
        
    Returns:
        List[BookMatchResponse]: Aggregated recommendations with scores
    """
    if len(book_ids) > 10:
        raise HTTPException(
            status_code=400, 
            detail="Maximum 10 books allowed for batch recommendations"
        )

    # Get source books
    source_books = db.query(Book).filter(Book.id.in_(book_ids)).all()
    if not source_books:
        raise HTTPException(status_code=404, detail="No books found with provided IDs")

    all_recommendations = {}  # Use dict to deduplicate

    for source_book in source_books:
        if not source_book.semantic_tags:
            continue  # Skip books without semantic data

        try:
            import json
            book_tags = json.loads(source_book.semantic_tags) if isinstance(source_book.semantic_tags, str) else source_book.semantic_tags
            
            # Get recommendations based on this book's tags
            matches = await semantic_service.find_matching_books(
                user_interests=book_tags,
                limit=limit_per_book,
                min_score=min_score,
                db=db
            )

            # Add to aggregated results (higher scores override lower ones)
            for match in matches:
                book_id = match["id"]
                if book_id not in book_ids:  # Don't recommend source books
                    if book_id not in all_recommendations or match["match_score"] > all_recommendations[book_id]["match_score"]:
                        all_recommendations[book_id] = match

        except Exception as e:
            continue  # Skip problematic books

    # Convert to response format and sort by score
    recommendations = []
    for match in all_recommendations.values():
        recommendations.append(BookMatchResponse(
            id=match["id"],
            title=match["title"],
            author=match["author"],
            description=match["description"],
            semantic_tags=match["semantic_tags"],
            match_score=match["match_score"],
            match_explanation=match["match_explanation"],
            matching_tags=match["matching_tags"]
        ))

    # Sort by match score descending
    recommendations.sort(key=lambda x: x.match_score, reverse=True)
    
    return recommendations[:limit_per_book * len(book_ids)]  # Reasonable limit on total results
