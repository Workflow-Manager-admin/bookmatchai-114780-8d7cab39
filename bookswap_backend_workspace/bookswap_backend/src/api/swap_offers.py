from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Annotated
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import SwapOffer, User, Book
from ..auth.clerk_utils import verify_clerk_token, ClerkUserInfo

router = APIRouter(
    prefix="/swap-offers",
    tags=["swap-offers"],
    responses={404: {"description": "Not found"}},
)

# Type alias for authenticated user dependency
AuthenticatedUser = Annotated[ClerkUserInfo, Depends(verify_clerk_token)]


class SwapOfferBase(BaseModel):
    """Base Pydantic model for SwapOffer data"""
    offered_book_id: int
    requested_book_id: int


class SwapOfferCreate(SwapOfferBase):
    """Request model for creating a swap offer"""
    pass


class SwapOfferUpdate(BaseModel):
    """Request model for updating a swap offer"""
    status: str


class SwapOfferResponse(SwapOfferBase):
    """Response model for swap offer data"""
    id: int
    sender_id: int
    receiver_id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.post("", response_model=SwapOfferResponse)
async def create_swap_offer(
    offer: SwapOfferCreate,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Create a new swap offer.
    Requires authentication.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify offered book exists and is owned by sender
    offered_book = db.query(Book).filter(Book.id == offer.offered_book_id).first()
    if not offered_book:
        raise HTTPException(status_code=404, detail="Offered book not found")
    if offered_book.owner_id != db_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only offer books you own"
        )

    # Verify requested book exists
    requested_book = db.query(Book).filter(Book.id == offer.requested_book_id).first()
    if not requested_book:
        raise HTTPException(status_code=404, detail="Requested book not found")
    if requested_book.owner_id == db_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot request your own book"
        )

    # Create new swap offer
    db_offer = SwapOffer(
        sender_id=db_user.id,
        receiver_id=requested_book.owner_id,
        offered_book_id=offer.offered_book_id,
        requested_book_id=offer.requested_book_id,
        status="pending"
    )
    db.add(db_offer)
    db.commit()
    db.refresh(db_offer)
    return db_offer


@router.get("/sent", response_model=List[SwapOfferResponse])
async def list_sent_offers(
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    List swap offers sent by the authenticated user.
    Requires authentication.
    """
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return db_user.sent_offers


@router.get("/received", response_model=List[SwapOfferResponse])
async def list_received_offers(
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    List swap offers received by the authenticated user.
    Requires authentication.
    """
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return db_user.received_offers


@router.get("/{offer_id}", response_model=SwapOfferResponse)
async def get_swap_offer(
    offer_id: int,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Get a specific swap offer by ID.
    Requires authentication and must be either sender or receiver.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get offer
    offer = db.query(SwapOffer).filter(SwapOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Swap offer not found")

    # Check if user is sender or receiver
    if offer.sender_id != db_user.id and offer.receiver_id != db_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view this swap offer"
        )

    return offer


@router.patch("/{offer_id}", response_model=SwapOfferResponse)
async def update_swap_offer(
    offer_id: int,
    offer_update: SwapOfferUpdate,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Update a swap offer's status.
    Requires authentication and proper authorization:
    - Sender can cancel (if pending)
    - Receiver can accept/reject (if pending)
    - Both can mark as completed (if accepted)
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get offer
    offer = db.query(SwapOffer).filter(SwapOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Swap offer not found")

    # Validate status transition based on user role and current status
    new_status = offer_update.status.lower()
    valid_statuses = ["pending", "accepted", "rejected", "completed", "cancelled"]

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    # Handle status updates based on user role and current status
    if offer.status == "pending":
        if new_status == "cancelled" and db_user.id == offer.sender_id:
            offer.status = new_status
        elif new_status in ["accepted", "rejected"] and db_user.id == offer.receiver_id:
            offer.status = new_status
        else:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to update offer status"
            )
    elif offer.status == "accepted":
        if new_status == "completed" and (
            db_user.id == offer.sender_id or db_user.id == offer.receiver_id
        ):
            offer.status = new_status
        else:
            raise HTTPException(
                status_code=400,
                detail="Can only mark accepted offers as completed"
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update offer with status: {offer.status}"
        )

    db.commit()
    db.refresh(offer)
    return offer


@router.delete("/{offer_id}", status_code=204)
async def delete_swap_offer(
    offer_id: int,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Delete a swap offer.
    Requires authentication and must be the sender of a non-accepted offer.
    """
    # Get database user
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get offer
    offer = db.query(SwapOffer).filter(SwapOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Swap offer not found")

    # Check if user is sender and offer is not accepted
    if offer.sender_id != db_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the sender can delete a swap offer"
        )
    if offer.status not in ["pending", "rejected"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete an accepted or completed offer"
        )

    # Delete offer
    db.delete(offer)
    db.commit()
    return None
