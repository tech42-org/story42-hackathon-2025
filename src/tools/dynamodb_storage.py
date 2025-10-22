"""
DynamoDB storage implementation for user data, stories, and sessions.

This module provides async operations for DynamoDB tables:
- Users: Cognito user information
- Stories: Story metadata and references to S3 objects
- Sessions: Generation session tracking with TTL

All operations are async and handle errors gracefully.
"""

import os
import boto3
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION', 'us-east-1'))

# Table names from environment
USERS_TABLE = os.getenv('DYNAMODB_USERS_TABLE')  # Optional: disable if not needed
STORIES_TABLE = os.getenv('DYNAMODB_STORIES_TABLE')
SESSIONS_TABLE = os.getenv('DYNAMODB_SESSIONS_TABLE', 'story-42-story-sessions-dev')


# ============================================================================
# USERS TABLE OPERATIONS
# ============================================================================

def create_or_update_user(user_id: str, email: str, **kwargs) -> Dict[str, Any]:
    """
    Create or update a user in DynamoDB.
    If USERS_TABLE not configured, returns mock data (Cognito handles auth).
    
    Args:
        user_id: Cognito user ID (sub)
        email: User's email address
        **kwargs: Additional user attributes
        
    Returns:
        User data dictionary
    """
    if not USERS_TABLE:
        logger.info(f"✅ User tracking disabled, using Cognito only: {user_id}")
        return {
            'user_id': user_id,
            'email': email,
            'created_at': datetime.now(timezone.utc).isoformat(),
            **kwargs
        }
    
    table = dynamodb.Table(USERS_TABLE)
    
    item = {
        'user_id': user_id,
        'email': email,
        'created_at': kwargs.get('created_at', datetime.now(timezone.utc).isoformat()),
        'updated_at': datetime.now(timezone.utc).isoformat(),
        **kwargs
    }
    
    try:
        table.put_item(Item=item)
        logger.info(f"✅ Created/updated user: {user_id}")
        return item
    except ClientError as e:
        logger.error(f"❌ Failed to create user: {e}")
        raise


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get user by user_id.
    If USERS_TABLE not configured, returns None (Cognito handles auth).
    
    Args:
        user_id: Cognito user ID (sub)
        
    Returns:
        User data or None if not found
    """
    if not USERS_TABLE:
        return None
    
    table = dynamodb.Table(USERS_TABLE)
    
    try:
        response = table.get_item(Key={'user_id': user_id})
        return response.get('Item')
    except ClientError as e:
        logger.error(f"❌ Failed to get user: {e}")
        return None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Get user by email using GSI.
    
    Args:
        email: User's email address
        
    Returns:
        User data or None if not found
    """
    table = dynamodb.Table(USERS_TABLE)
    
    try:
        response = table.query(
            IndexName='email-index',
            KeyConditionExpression='email = :email',
            ExpressionAttributeValues={':email': email}
        )
        items = response.get('Items', [])
        return items[0] if items else None
    except ClientError as e:
        logger.error(f"❌ Failed to get user by email: {e}")
        return None


# ============================================================================
# STORIES TABLE OPERATIONS
# ============================================================================

def create_story(
    story_id: str,
    user_id: str,
    title: str,
    s3_key_prefix: str,
    **kwargs
) -> Dict[str, Any]:
    """Placeholder that no longer persists story metadata."""
    return {
        "story_id": story_id,
        "user_id": user_id,
        "title": title,
        "s3_key_prefix": s3_key_prefix,
        **kwargs
    }


def get_story(story_id: str) -> Optional[Dict[str, Any]]:
    """Placeholder returning None because story metadata lives in S3."""
    return None


def get_user_stories(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Placeholder returning empty list because story metadata lives in S3."""
    return []


def update_story(story_id: str, updates: Dict[str, Any]) -> bool:
    """Placeholder."""
    return True


def delete_story(story_id: str) -> bool:
    """Placeholder."""
    return True


# ============================================================================
# SESSIONS TABLE OPERATIONS (for generation tracking)
# ============================================================================

def create_session(
    session_id: str,
    user_id: str,
    story_id: str,
    session_type: str = "story_generation",
    ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Create a new session for tracking generation progress.
    Adapted to work with team's audit table schema (user_id as HASH, session_id as RANGE).
    
    Args:
        session_id: Unique session identifier
        user_id: User identifier
        story_id: Related story identifier
        session_type: Type of session (story_generation, audio_generation, etc.)
        ttl_hours: Hours until session expires (default: 24)
        
    Returns:
        Session data dictionary
    """
    table = dynamodb.Table(SESSIONS_TABLE)
    
    timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    
    item = {
        'user_id': user_id,  # HASH key
        'session_id': session_id,  # RANGE key
        'route': 'ai_story_generation',  # Team's schema field
        'timestamp': timestamp_ms,  # Team's schema field
        'created_at': datetime.now(timezone.utc).isoformat(),
        'request': {
            'session_type': session_type,
            'story_id': story_id
        },
        'response': {
            'status': 'initiated',
            'progress': 0
        }
    }
    
    try:
        table.put_item(Item=item)
        logger.info(f"✅ Created session: {session_id}")
        return item
    except ClientError as e:
        logger.error(f"❌ Failed to create session: {e}")
        raise


def get_session(session_id: str, user_id: str = None) -> Optional[Dict[str, Any]]:
    """
    Get session by session_id.
    Note: Team's table requires user_id (HASH) + session_id (RANGE).
    If user_id not provided, will scan (slow but works).
    
    Args:
        session_id: Session identifier
        user_id: User identifier (optional, but recommended for performance)
        
    Returns:
        Session data or None if not found
    """
    table = dynamodb.Table(SESSIONS_TABLE)
    
    try:
        if user_id:
            # Fast: Direct key lookup
            response = table.get_item(Key={'user_id': user_id, 'session_id': session_id})
            return response.get('Item')
        else:
            # Slow: Scan for session_id (fallback)
            response = table.scan(
                FilterExpression='session_id = :sid',
                ExpressionAttributeValues={':sid': session_id},
                Limit=1
            )
            items = response.get('Items', [])
            return items[0] if items else None
    except ClientError as e:
        logger.error(f"❌ Failed to get session: {e}")
        return None


def update_session(session_id: str, updates: Dict[str, Any], user_id: str = None) -> bool:
    """
    Update session data (e.g., status, progress).
    Adapted for team's table (requires user_id).
    
    Args:
        session_id: Session identifier
        updates: Dictionary of fields to update
        user_id: User identifier (optional, will lookup if not provided)
        
    Returns:
        True if successful, False otherwise
    """
    table = dynamodb.Table(SESSIONS_TABLE)
    
    # Get user_id if not provided
    if not user_id:
        session = get_session(session_id)
        if session:
            user_id = session.get('user_id')
        if not user_id:
            logger.warning(f"Cannot update session {session_id}: user_id required")
            return False
    
    try:
        # Get existing session
        existing = get_session(session_id, user_id)
        if not existing:
            logger.warning(f"Session {session_id} not found")
            return False
        
        # Merge updates into response field
        response_data = existing.get('response', {})
        response_data.update(updates)
        response_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        table.update_item(
            Key={'user_id': user_id, 'session_id': session_id},
            UpdateExpression="SET #resp = :resp",
            ExpressionAttributeNames={'#resp': 'response'},
            ExpressionAttributeValues={':resp': response_data}
        )
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to update session: {e}")
        return False


def get_user_sessions(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get recent sessions for a user.
    
    Args:
        user_id: User identifier
        limit: Maximum number of sessions to return
        
    Returns:
        List of session data dictionaries
    """
    table = dynamodb.Table(SESSIONS_TABLE)
    
    try:
        response = table.query(
            IndexName='user-sessions-index',
            KeyConditionExpression='user_id = :user_id',
            ExpressionAttributeValues={':user_id': user_id},
            Limit=limit
        )
        return response.get('Items', [])
    except ClientError as e:
        logger.error(f"❌ Failed to get user sessions: {e}")
        return []

