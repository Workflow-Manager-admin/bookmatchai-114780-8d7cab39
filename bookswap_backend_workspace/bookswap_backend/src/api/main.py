from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from ..database import engine, get_db
from .. import models

# Create database tables
models.Base.metadata.create_all(bind=engine)


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
