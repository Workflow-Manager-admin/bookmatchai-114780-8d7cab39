from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated
from pydantic import BaseModel
from ..database import get_db
from ..models import User
from ..auth.clerk_utils import verify_clerk_token, ClerkUserInfo

router = APIRouter(
    prefix="/profiles",
    tags=["profiles"],
    responses={404: {"description": "Not found"}},
)

# Type alias for authenticated user dependency
AuthenticatedUser = Annotated[ClerkUserInfo, Depends(verify_clerk_token)]


class UserProfileResponse(BaseModel):
    """Response model for user profile data"""
    clerk_user_id: str
    email: str
    username: str | None = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    """Request model for updating user profile"""
    username: str | None = None


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Get the authenticated user's profile information.

    Returns:
        UserProfileResponse: Current user's profile data
    """
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        # Auto-create user profile if it doesn't exist
        db_user = User(
            clerk_user_id=user.clerk_user_id,
            email=user.email,
            username=user.username
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    return db_user


@router.patch("/me", response_model=UserProfileResponse)
async def update_my_profile(
    update_data: UserProfileUpdate,
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Update the authenticated user's profile information.

    Args:
        update_data: UserProfileUpdate model containing fields to update

    Returns:
        UserProfileResponse: Updated user profile data
    """
    db_user = db.query(User).filter(User.clerk_user_id == user.clerk_user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User profile not found")

    # Update allowed fields
    if update_data.username is not None:
        # Check username uniqueness
        existing_user = db.query(User).filter(
            User.username == update_data.username
        ).first()
        if existing_user and existing_user.id != db_user.id:
            raise HTTPException(
                status_code=400,
                detail="Username already taken"
            )
        db_user.username = update_data.username

    db.commit()
    db.refresh(db_user)
    return db_user
