from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional, Annotated
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Book, User
from ..auth.clerk_utils import verify_clerk_token, ClerkUserInfo

router = APIRouter(
    prefix="/books",
    tags=["books"],
    responses={404: {"description": "Not found"}},
)

# Type alias for authenticated user dependency
AuthenticatedUser = Annotated[ClerkUserInfo, Depends(verify_clerk_token)]


class BookBase(BaseModel):
    """Base Pydantic model for Book data"""
    title: str
    author: str
    description: Optional[str] = None
    condition: Optional[str] = None


class BookCreate(BookBase):
    """Request model for creating a book"""
    pass


class BookUpdate(BookBase):
    """Request model for updating a book"""
    title: Optional[str] = None
    author: Optional[str] = None


class BookResponse(BookBase):
    """Response model for book data"""
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    llm_summary: Optional[str] = None
    semantic_tags: Optional[List[str]] = None

    class Config:
        from_attributes = True


class PageResponse(BaseModel):
    """Generic paginated response model"""
    items: List[BookResponse]
    total: int
    page: int
    limit: int
    has_more: bool


@router.post("", response_model=BookResponse)
async def create_book(
    book: BookCreate,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Create a new book listing.
    Requires authentication.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create new book
    db_book = Book(
        **book.model_dump(),
        owner_id=db_user.id
    )
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book


@router.get("", response_model=PageResponse)
async def list_books(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in title or author"),
    condition: Optional[str] = Query(None, description="Filter by book condition"),
    db: Session = Depends(get_db)
):
    """
    List books with pagination and filtering.
    Public endpoint.
    """
    # Base query
    query = db.query(Book)

    # Apply filters
    if search:
        query = query.filter(
            or_(
                Book.title.ilike(f"%{search}%"),
                Book.author.ilike(f"%{search}%")
            )
        )
    if condition:
        query = query.filter(Book.condition == condition)

    # Get total count
    total = query.count()

    # Apply pagination
    books = query.offset((page - 1) * limit).limit(limit).all()

    # Calculate if there are more pages
    has_more = (page * limit) < total

    return PageResponse(
        items=books,
        total=total,
        page=page,
        limit=limit,
        has_more=has_more
    )


@router.get("/my", response_model=List[BookResponse])
async def list_my_books(
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    List books owned by the authenticated user.
    Requires authentication.
    """
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return db_user.books


@router.get("/{book_id}", response_model=BookResponse)
async def get_book(
    book_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific book by ID.
    Public endpoint.
    """
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.patch("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: int,
    book_update: BookUpdate,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Update a book listing.
    Requires authentication and ownership.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get book
    db_book = db.query(Book).filter(Book.id == book_id).first()
    if not db_book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Check ownership
    if db_book.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this book")

    # Update fields
    update_data = book_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_book, field, value)

    db.commit()
    db.refresh(db_book)
    return db_book


@router.delete("/{book_id}", status_code=204)
async def delete_book(
    book_id: int,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Delete a book listing.
    Requires authentication and ownership.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get book
    db_book = db.query(Book).filter(Book.id == book_id).first()
    if not db_book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Check ownership
    if db_book.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this book")

    # Delete book
    db.delete(db_book)
    db.commit()
    return None
