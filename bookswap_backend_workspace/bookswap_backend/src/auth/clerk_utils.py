import os
from typing import Dict, Optional
from datetime import datetime
import httpx
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Constants
CLERK_JWKS_URL = "https://clerk.clerk.dev/.well-known/jwks.json"
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "https://clerk.clerk.dev")
CLERK_JWT_ALGORITHM = "RS256"

# Initialize security scheme
security = HTTPBearer()

# Cache for JWKS
_jwks_cache: Dict = {}
_last_jwks_fetch: Optional[datetime] = None
JWKS_CACHE_TTL_SECONDS = 3600  # 1 hour


class ClerkUserInfo(BaseModel):
    """Model for extracted user info from Clerk JWT"""
    clerk_user_id: str
    email: str
    username: Optional[str] = None


async def get_jwks() -> Dict:
    """
    Fetch and cache JWKS (JSON Web Key Set) from Clerk.
    Implements caching with TTL to avoid frequent HTTP requests.

    Returns:
        Dict: The JWKS data
    """
    global _jwks_cache, _last_jwks_fetch

    # Check if we have a valid cached JWKS
    now = datetime.utcnow()
    if _jwks_cache and _last_jwks_fetch:
        cache_age = (now - _last_jwks_fetch).total_seconds()
        if cache_age < JWKS_CACHE_TTL_SECONDS:
            return _jwks_cache

    # Fetch fresh JWKS
    async with httpx.AsyncClient() as client:
        response = await client.get(CLERK_JWKS_URL)
        response.raise_for_status()
        _jwks_cache = response.json()
        _last_jwks_fetch = now
        return _jwks_cache


# PUBLIC_INTERFACE
async def verify_clerk_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> ClerkUserInfo:
    """
    Verify and decode a Clerk JWT token. This function is designed to be used
    with FastAPI's dependency injection system.

    Args:
        credentials: HTTP Authorization credentials containing the JWT

    Returns:
        ClerkUserInfo: Extracted user information from the verified token

    Raises:
        HTTPException: If token is invalid, expired, or verification fails
    """
    try:
        token = credentials.credentials
        jwks = await get_jwks()

        # Unverified decode to get the key ID (kid)
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise HTTPException(
                status_code=401,
                detail="Invalid token header: No key ID (kid)"
            )

        # Find the matching key in JWKS
        key = None
        for jwk in jwks.get("keys", []):
            if jwk.get("kid") == kid:
                key = jwk
                break

        if not key:
            raise HTTPException(
                status_code=401,
                detail="No matching key found in JWKS"
            )

        # Verify and decode the token
        payload = jwt.decode(
            token,
            key,
            algorithms=[CLERK_JWT_ALGORITHM],
            issuer=CLERK_ISSUER
        )

        # Extract user info
        user_info = ClerkUserInfo(
            clerk_user_id=payload.get("sub"),
            email=payload.get("email"),
            username=payload.get("username")
        )

        return user_info

    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch JWKS: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )
