"""
Utility functions for semantic processing and cache management
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import SessionLocal
from ..semantic import semantic_service
from ..models import Book, SemanticCache

logger = logging.getLogger(__name__)


# PUBLIC_INTERFACE
async def batch_enrich_books(
    book_ids: Optional[List[int]] = None,
    limit: int = 100,
    force_refresh: bool = False
) -> Dict[str, int]:
    """
    Batch process books for semantic enrichment
    
    Args:
        book_ids: Specific book IDs to process (if None, processes books without tags)
        limit: Maximum number of books to process
        force_refresh: Whether to refresh existing semantic data
        
    Returns:
        Dict with counts of processed, successful, and failed books
    """
    db = SessionLocal()
    try:
        # Build query based on parameters
        if book_ids:
            books = db.query(Book).filter(Book.id.in_(book_ids)).limit(limit).all()
        elif force_refresh:
            books = db.query(Book).limit(limit).all()
        else:
            # Only process books without semantic tags
            books = db.query(Book).filter(
                (Book.semantic_tags.is_(None)) | 
                (Book.semantic_tags == 'null') |
                (Book.semantic_tags == '[]')
            ).limit(limit).all()

        results = {
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0
        }

        for book in books:
            results["processed"] += 1
            
            # Skip books without description
            if not book.description or len(book.description.strip()) < 10:
                logger.info(f"Skipping book {book.id} - insufficient description")
                results["skipped"] += 1
                continue

            try:
                success = await semantic_service.enrich_book_with_semantic_data(
                    book.id, book.title, book.author, book.description, db
                )
                
                if success:
                    results["successful"] += 1
                    logger.info(f"Successfully enriched book {book.id}: {book.title}")
                else:
                    results["failed"] += 1
                    logger.warning(f"Failed to enrich book {book.id}: {book.title}")
                    
                # Small delay to avoid overwhelming the API
                await asyncio.sleep(0.5)
                
            except Exception as e:
                results["failed"] += 1
                logger.error(f"Error enriching book {book.id}: {e}")

        logger.info(f"Batch enrichment completed: {results}")
        return results

    finally:
        db.close()


# PUBLIC_INTERFACE
def clean_semantic_cache(days_old: int = 30) -> int:
    """
    Clean old entries from semantic cache
    
    Args:
        days_old: Remove entries older than this many days
        
    Returns:
        Number of entries removed
    """
    db = SessionLocal()
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        # Count entries to be deleted
        count_query = text("""
            SELECT COUNT(*) FROM semantic_cache 
            WHERE created_at < :cutoff_date
        """)
        count_result = db.execute(count_query, {"cutoff_date": cutoff_date}).scalar()
        
        # Delete old entries
        delete_query = text("""
            DELETE FROM semantic_cache 
            WHERE created_at < :cutoff_date
        """)
        db.execute(delete_query, {"cutoff_date": cutoff_date})
        db.commit()
        
        logger.info(f"Cleaned {count_result} old cache entries")
        return count_result
        
    except Exception as e:
        logger.error(f"Failed to clean semantic cache: {e}")
        db.rollback()
        return 0
    finally:
        db.close()


# PUBLIC_INTERFACE
def get_semantic_stats() -> Dict[str, int]:
    """
    Get statistics about semantic processing
    
    Returns:
        Dictionary with various statistics
    """
    db = SessionLocal()
    try:
        stats = {}
        
        # Total books
        stats["total_books"] = db.query(Book).count()
        
        # Books with semantic tags
        books_with_tags = db.query(Book).filter(
            Book.semantic_tags.isnot(None),
            Book.semantic_tags != 'null',
            Book.semantic_tags != '[]'
        ).count()
        stats["books_with_semantic_tags"] = books_with_tags
        
        # Books without semantic tags
        stats["books_without_semantic_tags"] = stats["total_books"] - books_with_tags
        
        # Cache statistics
        stats["cache_entries"] = db.query(SemanticCache).count()
        
        # Recent cache entries (last 24 hours)
        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        stats["recent_cache_entries"] = db.query(SemanticCache).filter(
            SemanticCache.created_at > recent_cutoff
        ).count()
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get semantic stats: {e}")
        return {}
    finally:
        db.close()


# PUBLIC_INTERFACE
async def validate_semantic_data() -> Dict[str, List[int]]:
    """
    Validate semantic data integrity
    
    Returns:
        Dictionary with lists of book IDs with issues
    """
    db = SessionLocal()
    try:
        issues = {
            "invalid_json": [],
            "empty_tags": [],
            "missing_summaries": []
        }
        
        # Get all books with semantic data
        books = db.query(Book).filter(
            Book.semantic_tags.isnot(None)
        ).all()
        
        for book in books:
            # Check JSON validity
            if book.semantic_tags:
                try:
                    tags = json.loads(book.semantic_tags) if isinstance(book.semantic_tags, str) else book.semantic_tags
                    if not isinstance(tags, list) or len(tags) == 0:
                        issues["empty_tags"].append(book.id)
                except (json.JSONDecodeError, TypeError):
                    issues["invalid_json"].append(book.id)
            
            # Check for missing summaries
            if not book.llm_summary or len(book.llm_summary.strip()) < 10:
                issues["missing_summaries"].append(book.id)
        
        return issues
        
    except Exception as e:
        logger.error(f"Failed to validate semantic data: {e}")
        return {}
    finally:
        db.close()


if __name__ == "__main__":
    # CLI interface for utility functions
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python semantic_utils.py <command> [args]")
        print("Commands: batch_enrich, clean_cache, stats, validate")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "batch_enrich":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
        results = asyncio.run(batch_enrich_books(limit=limit))
        print(f"Batch enrichment results: {results}")
        
    elif command == "clean_cache":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        count = clean_semantic_cache(days)
        print(f"Cleaned {count} cache entries older than {days} days")
        
    elif command == "stats":
        stats = get_semantic_stats()
        print("Semantic processing statistics:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
            
    elif command == "validate":
        issues = asyncio.run(validate_semantic_data())
        print("Semantic data validation results:")
        for issue_type, book_ids in issues.items():
            print(f"  {issue_type}: {len(book_ids)} books")
            if book_ids:
                print(f"    Book IDs: {book_ids[:10]}{'...' if len(book_ids) > 10 else ''}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
