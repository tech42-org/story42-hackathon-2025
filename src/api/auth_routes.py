"""
Authentication API routes.

Endpoints for user registration, login, and profile management.
"""

from fastapi import APIRouter, Depends, HTTPException
from src.auth import CognitoAuth, UserCredentials, SignUpCredentials, TokenResponse, UserInfo, get_auth, require_auth
from typing import Dict
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/signup", response_model=Dict)
async def signup(credentials: SignUpCredentials, auth: CognitoAuth = Depends(get_auth)):
    """
    Register a new user.
    
    **What it does**: Creates a new user account in AWS Cognito
    
    **Parameters**:
    - `email`: Valid email address (used as username)
    - `password`: Must meet Cognito password requirements (min 8 chars, uppercase, lowercase, number, special char)
    - `name` (optional): Display name for the user
    
    **Response**:
    - `user_sub`: Unique user identifier
    - `user_confirmed`: Whether email verification is required
    - `message`: Instructions for next steps
    
    **Why**: Cognito provides secure user management with built-in email verification and password policies
    
    **Alternative**: Could use custom JWT auth with database, but Cognito handles security and compliance
    """
    logger.info(f"Signup request for email: {credentials.email}")
    result = auth.sign_up(credentials)
    return result


@router.post("/signin", response_model=TokenResponse)
async def signin(credentials: UserCredentials, auth: CognitoAuth = Depends(get_auth)):
    """
    Sign in and get JWT tokens.
    
    **What it does**: Authenticates user and returns access, ID, and refresh tokens
    
    **Parameters**:
    - `email`: User's email address
    - `password`: User's password
    
    **Response**:
    - `access_token`: Used for API authorization
    - `id_token`: Contains user identity information
    - `refresh_token`: Used to get new tokens when expired
    - `expires_in`: Token lifetime in seconds (typically 3600)
    
    **Usage**: Store tokens in client (localStorage/sessionStorage), include access_token in Authorization header
    
    **Best Practice**: Use refresh tokens to get new access tokens instead of storing passwords
    
    **Risks**: Never store tokens in cookies without httpOnly flag or expose in URLs
    """
    logger.info(f"Sign in request for email: {credentials.email}")
    tokens = auth.sign_in(credentials)
    return tokens


@router.get("/me", response_model=UserInfo)
async def get_current_user(user_data: Dict = Depends(require_auth), auth: CognitoAuth = Depends(get_auth)):
    """
    Get current user information.
    
    **What it does**: Retrieves user profile from Cognito using the access token
    
    **Authorization**: Requires valid JWT token in Authorization header: `Bearer <access_token>`
    
    **Response**:
    - `sub`: User ID (unique identifier)
    - `email`: User's email address
    - `email_verified`: Email verification status
    - `name`: User's display name
    
    **Why**: Allows frontend to display user info and check authentication status
    
    **Alternative**: Could decode ID token on client, but this ensures fresh data from Cognito
    """
    # Extract access token from authorization header
    # The token_data comes from verify_token dependency
    logger.info(f"Get user info for user: {user_data.get('sub')}")
    
    # In dev mode with disabled auth
    if not auth.enabled:
        return UserInfo(
            sub="dev-user",
            email="dev@example.com",
            email_verified=True,
            name="Dev User"
        )
    
    # Return user info (token already verified by require_auth)
    return UserInfo(
        sub=user_data.get('sub', ''),
        email=user_data.get('email', ''),
        email_verified=user_data.get('email_verified', False),
        name=user_data.get('name')
    )


@router.get("/health")
async def auth_health(auth: CognitoAuth = Depends(get_auth)):
    """
    Check authentication service health.
    
    **What it does**: Verifies Cognito configuration and connectivity
    
    **Response**:
    - `enabled`: Whether auth is configured
    - `user_pool_id`: Cognito user pool ID
    - `region`: AWS region
    
    **Usage**: Check this endpoint before showing auth UI
    """
    return {
        "enabled": auth.enabled,
        "user_pool_id": auth.user_pool_id if auth.enabled else None,
        "region": auth.region
    }


def register_auth_routes(app):
    """Register authentication routes with FastAPI app."""
    app.include_router(router)
    logger.info("Authentication routes registered")

