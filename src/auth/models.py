"""
Authentication data models.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional


class UserCredentials(BaseModel):
    """User login credentials."""
    email: EmailStr
    password: str


class SignUpCredentials(BaseModel):
    """User registration credentials."""
    email: EmailStr
    password: str
    name: Optional[str] = None


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    id_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class UserInfo(BaseModel):
    """User information from Cognito."""
    sub: str  # User ID
    email: str
    email_verified: bool
    name: Optional[str] = None

