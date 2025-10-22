"""
AWS Cognito Authentication Module.

Provides authentication, authorization, and user management.
"""

from .cognito_auth import (
    CognitoAuth,
    verify_token,
    require_auth,
    get_auth
)
from .models import UserCredentials, SignUpCredentials, TokenResponse, UserInfo

__all__ = [
    "CognitoAuth",
    "verify_token",
    "require_auth",
    "get_auth",
    "UserCredentials",
    "SignUpCredentials",
    "TokenResponse",
    "UserInfo"
]

