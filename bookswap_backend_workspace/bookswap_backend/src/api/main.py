from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Annotated
from ..database import engine, get_db
from .. import models
from ..auth.clerk_utils import verify_clerk_token, ClerkUserInfo
from .profiles import router as profiles_router
from .books import router as books_router
from .swap_offers import router as swap_offers_router

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Type alias for authenticated user dependency
AuthenticatedUser = Annotated[ClerkUserInfo, Depends(verify_clerk_token)]


app = FastAPI(
    title="BookSwap+ API",
    description=(
        "API for BookSwap+ platform - "
        "A community book exchange service with semantic matching"
    ),
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(profiles_router)
app.include_router(books_router)
app.include_router(swap_offers_router)


@app.get("/")
def health_check(db: Session = Depends(get_db)):
    """
    Check API health and database connection
    """
    try:
        # Test database connection
        db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


@app.get("/protected/me", response_model=dict)
async def get_user_info(
    user: AuthenticatedUser,
    db: Session = Depends(get_db)
):
    """
    Protected route example - Get authenticated user info
    Requires valid Clerk JWT token
    """
    return {
        "user_id": user.clerk_user_id,
        "email": user.email,
        "username": user.username
    }
