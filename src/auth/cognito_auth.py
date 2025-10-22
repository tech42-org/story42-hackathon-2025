"""
AWS Cognito Authentication Service.

Handles user authentication, token management, and authorization.
Automatically syncs users to DynamoDB on successful authentication.
"""

import os
import logging
from typing import Optional, Dict

import boto3
import jwt
from jwt import PyJWKClient
from jwt import InvalidTokenError, InvalidSignatureError
from botocore.exceptions import ClientError
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .models import UserCredentials, SignUpCredentials, TokenResponse, UserInfo
from src.tools.dynamodb_storage import create_or_update_user, get_user

logger = logging.getLogger(__name__)

# Security scheme for JWT tokens
security = HTTPBearer()


class CognitoAuth:
    """AWS Cognito authentication service."""
    
    def __init__(self):
        """Initialize Cognito client with environment variables."""
        # Prefer explicit Cognito region settings, fall back to AWS defaults
        self.region = (
            os.getenv("COGNITO_REGION")
            or os.getenv("AWS_REGION")
            or os.getenv("AWS_DEFAULT_REGION")
            or "us-east-1"
        )
        self.user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
        self.client_id = os.getenv("COGNITO_CLIENT_ID")
        self.client_secret = os.getenv("COGNITO_CLIENT_SECRET")
        
        if not all([self.user_pool_id, self.client_id]):
            logger.warning("Cognito configuration incomplete. Auth features will be disabled.")
            self.enabled = False
            return
        
        self.client = boto3.client('cognito-idp', region_name=self.region)
        self.issuer = f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}"
        jwks_url = f"{self.issuer}/.well-known/jwks.json"
        try:
            self.jwks_client = PyJWKClient(jwks_url)
        except Exception as exc:
            logger.error("Failed to initialize JWKS client for Cognito: %s", exc)
            self.enabled = False
            return
        self.enabled = True
        logger.info(f"Cognito auth initialized: Pool={self.user_pool_id}, Region={self.region}")
    
    def sign_up(self, credentials: SignUpCredentials) -> Dict:
        """
        Register a new user.
        
        Args:
            credentials: User registration data
        
        Returns:
            Dictionary with user sub and confirmation status
        
        Raises:
            HTTPException: If registration fails
        """
        if not self.enabled:
            raise HTTPException(
                status_code=503,
                detail="Authentication service is not configured"
            )
        
        try:
            response = self.client.sign_up(
                ClientId=self.client_id,
                Username=credentials.email,
                Password=credentials.password,
                UserAttributes=[
                    {'Name': 'email', 'Value': credentials.email},
                    {'Name': 'name', 'Value': credentials.name or credentials.email}
                ]
            )
            
            return {
                "user_sub": response['UserSub'],
                "user_confirmed": response.get('UserConfirmed', False),
                "message": "User registered successfully. Please check your email for verification."
            }
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'UsernameExistsException':
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User already exists"
                )
            elif error_code == 'InvalidPasswordException':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password does not meet requirements"
                )
            else:
                logger.error(f"Sign up error: {error_code} - {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Registration failed: {str(e)}"
                )
    
    def sign_in(self, credentials: UserCredentials) -> TokenResponse:
        """
        Authenticate user and return tokens.
        
        Args:
            credentials: User login credentials
        
        Returns:
            TokenResponse with JWT tokens
        
        Raises:
            HTTPException: If authentication fails
        """
        if not self.enabled:
            raise HTTPException(
                status_code=503,
                detail="Authentication service is not configured"
            )
        
        try:
            # Use USER_PASSWORD_AUTH flow
            response = self.client.initiate_auth(
                ClientId=self.client_id,
                AuthFlow='USER_PASSWORD_AUTH',
                AuthParameters={
                    'USERNAME': credentials.email,
                    'PASSWORD': credentials.password
                }
            )
            
            auth_result = response['AuthenticationResult']
            
            # Decode ID token to get user info
            id_token = auth_result['IdToken']
            user_info = jwt.decode(id_token, options={"verify_signature": False})
            
            # Auto-create/update user in DynamoDB
            try:
                user_id = user_info['sub']
                email = user_info.get('email', credentials.email)
                create_or_update_user(user_id=user_id, email=email)
                logger.info(f"✅ User synced to DynamoDB: {user_id}")
            except Exception as e:
                logger.error(f"⚠️ Failed to sync user to DynamoDB: {e}")
                # Don't fail login if DynamoDB sync fails
            
            return TokenResponse(
                access_token=auth_result['AccessToken'],
                id_token=auth_result['IdToken'],
                refresh_token=auth_result.get('RefreshToken', ''),
                expires_in=auth_result['ExpiresIn']
            )
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NotAuthorizedException':
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect username or password"
                )
            elif error_code == 'UserNotConfirmedException':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is not confirmed. Please verify your email."
                )
            else:
                logger.error(f"Sign in error: {error_code} - {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Authentication failed: {str(e)}"
                )
    
    def verify_token(self, token: str) -> Dict:
        """
        Verify and decode a JWT token.
        
        Args:
            token: JWT token to verify
        
        Returns:
            Decoded token payload
        
        Raises:
            HTTPException: If token is invalid
        """
        if not self.enabled:
            raise HTTPException(
                status_code=503,
                detail="Authentication service is not configured"
            )
        
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            decoded = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=self.issuer,
            )

            token_use = decoded.get("token_use")
            if token_use not in {"id", "access"}:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token use",
                )

            return decoded

        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except (InvalidSignatureError, InvalidTokenError) as exc:
            logger.warning("Token verification failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    
    def get_user_info(self, access_token: str) -> UserInfo:
        """
        Get user information from access token.
        
        Args:
            access_token: Cognito access token
        
        Returns:
            UserInfo object
        
        Raises:
            HTTPException: If token is invalid
        """
        if not self.enabled:
            raise HTTPException(
                status_code=503,
                detail="Authentication service is not configured"
            )
        
        try:
            response = self.client.get_user(AccessToken=access_token)
            
            # Parse user attributes
            attributes = {attr['Name']: attr['Value'] for attr in response['UserAttributes']}
            
            return UserInfo(
                sub=attributes.get('sub', ''),
                email=attributes.get('email', ''),
                email_verified=attributes.get('email_verified', 'false').lower() == 'true',
                name=attributes.get('name')
            )
            
        except ClientError as e:
            logger.error(f"Get user info error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to retrieve user information"
            )


# Global auth instance
_auth_instance = None

def get_auth() -> CognitoAuth:
    """Get or create the global auth instance."""
    global _auth_instance
    if _auth_instance is None:
        _auth_instance = CognitoAuth()
    return _auth_instance


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    """
    FastAPI dependency to verify JWT tokens.
    
    Usage:
        @app.get("/protected")
        async def protected_route(token_data: Dict = Depends(verify_token)):
            return {"user_id": token_data["sub"]}
    """
    auth = get_auth()
    if not auth.enabled:
        # If auth is disabled, allow all requests (dev mode)
        logger.warning("Auth is disabled. Allowing request without authentication.")
        return {"sub": "dev-user", "email": "dev@example.com"}
    
    token = credentials.credentials
    return auth.verify_token(token)


async def require_auth(token_data: Dict = Depends(verify_token)) -> Dict:
    """
    FastAPI dependency that requires authentication.
    
    Usage:
        @app.post("/api/v1/stories")
        async def create_story(user: Dict = Depends(require_auth)):
            return {"message": f"Story created by {user['email']}"}
    """
    return token_data

