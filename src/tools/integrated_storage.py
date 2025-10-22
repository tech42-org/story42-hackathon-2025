"""
Integrated storage layer combining DynamoDB metadata and S3 file storage.

This module provides a unified interface for storing and retrieving stories,
abstracting away the details of DynamoDB and S3.

Storage Strategy:
- DynamoDB: User info, story metadata, session tracking
- S3: Story files (text, JSON, audio, images)
"""

import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

from src.tools.dynamodb_storage import (
    create_or_update_user,
    get_user,
    create_session,
    get_session,
    update_session
)

from src.tools.s3_storage import (
    save_story_text,
    get_story_text,
    save_story_json,
    get_story_json,
    save_metadata,
    get_metadata,
    update_metadata,
    list_story_metadata,
    save_audio_file,
    get_audio_url,
    save_image,
    list_images,
    delete_story_files,
    refresh_presigned_image_urls,
    get_story_prefix
)

logger = logging.getLogger(__name__)


# ============================================================================
# UNIFIED STORY OPERATIONS
# ============================================================================

async def save_complete_story(
    session_id: str,
    user_id: str,
    story_data: Dict[str, Any]
) -> bool:
    """
    Save a complete story to both DynamoDB (metadata) and S3 (files).
    
    Args:
        session_id: Story session ID (used as story_id)
        user_id: Owner's user ID
        story_data: Complete story data including text, structured_story, metadata
        
    Returns:
        True if successful, False otherwise
    """
    try:
        story_id = session_id
        title = story_data.get('title', 'Untitled Story')
        
        # Save story metadata to S3 only
        metadata = {
            'session_id': session_id,
            'story_id': story_id,
            'title': title,
            'topic': story_data.get('topic'),
            'story_type': story_data.get('story_type', 'fiction'),
            'length': story_data.get('length', 'medium'),
            'tone_style': story_data.get('tone_style'),
            'target_audience': story_data.get('target_audience'),
            'status': 'completed',
            'has_audio': False,
            'has_images': False,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'word_count': len(story_data.get('story_text', '').split()) if 'story_text' in story_data else 0
        }
        save_metadata(user_id, story_id, metadata)
        logger.info(f"✅ Saved story metadata to S3: {story_id}")
        
        # Save story text to S3
        if 'story_text' in story_data:
            save_story_text(user_id, story_id, story_data['story_text'])
            logger.info(f"✅ Saved story text to S3: {story_id}")
        
        # Save structured story JSON to S3
        if 'structured_story' in story_data:
            save_story_json(user_id, story_id, story_data['structured_story'])
            logger.info(f"✅ Saved structured story to S3: {story_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save complete story: {e}")
        return False


async def load_complete_story(
    story_id: str,
    user_id: str
) -> Optional[Dict[str, Any]]:
    """
    Load a complete story from DynamoDB and S3.
    
    Args:
        story_id: Story identifier
        user_id: Owner's user ID
        
    Returns:
        Complete story data dictionary or None if not found
    """
    try:
        # Load metadata from S3
        s3_metadata = get_metadata(user_id, story_id)
        if not s3_metadata:
            logger.warning(f"Story metadata not found in S3: {story_id}")
            return None
        
        # Load story text from S3
        story_text = get_story_text(user_id, story_id)
        
        # Load structured story from S3
        structured_story = get_story_json(user_id, story_id)
        
        # Combine everything
        story_data = {
            'session_id': story_id,
            'story_id': story_id,
            'title': s3_metadata.get('title', 'Untitled Story'),
            'topic': s3_metadata.get('topic'),
            'story_type': s3_metadata.get('story_type'),
            'length': s3_metadata.get('length'),
            'tone_style': s3_metadata.get('tone_style'),
            'target_audience': s3_metadata.get('target_audience'),
            'created_at': s3_metadata.get('created_at'),
            'status': s3_metadata.get('status', 'completed'),
            'has_audio': s3_metadata.get('has_audio', False),
            'has_images': s3_metadata.get('has_images', False),
            'story_text': story_text,
            'structured_story': structured_story,
            'metadata': s3_metadata
        }
        
        return story_data
        
    except Exception as e:
        logger.error(f"❌ Failed to load complete story: {e}")
        return None


async def list_user_stories_integrated(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    List all stories for a user from DynamoDB.
    
    Args:
        user_id: User identifier
        limit: Maximum number of stories to return
        
    Returns:
        List of story summaries
    """
    try:
        # Attempt to list metadata from S3
        metadata_entries = list_story_metadata(user_id, limit)
        return metadata_entries
    except Exception as e:
        logger.error(f"❌ Failed to list user stories: {e}")
        return []


async def delete_complete_story(story_id: str, user_id: str) -> bool:
    """
    Delete a story from both DynamoDB and S3.
    
    Args:
        story_id: Story identifier
        user_id: Owner's user ID
        
    Returns:
        True if successful, False otherwise
    """
    try:
        metadata = get_metadata(user_id, story_id)
        if metadata and metadata.get('user_id') not in (None, user_id):
            logger.warning(f"Cannot delete story {story_id}: not found or not owned by {user_id}")
            return False

        # Delete from S3
        delete_story_files(user_id, story_id)
        logger.info(f"✅ Deleted story files from S3: {story_id}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to delete complete story: {e}")
        return False


# ============================================================================
# AUDIO OPERATIONS
# ============================================================================

async def mark_story_has_audio(story_id: str) -> bool:
    """Mark a story as having audio generated."""
    logger.warning("mark_story_has_audio invoked but audio state lives only in S3 metadata; no DynamoDB update necessary.")
    return True


async def get_story_audio_url(story_id: str, user_id: str) -> Optional[str]:
    """Get presigned URL for story audio."""
    # Verify ownership
    metadata = get_metadata(user_id, story_id)
    if not metadata:
        return None
    
    return get_audio_url(user_id, story_id)


# ============================================================================
# IMAGE OPERATIONS
# ============================================================================

async def save_story_image(story_id: str, user_id: str, image_data: bytes, image_number: int) -> bool:
    """Save a generated image for a story."""
    success = save_image(user_id, story_id, image_data, image_number)
    if success:
        update_metadata(user_id, story_id, {
            'has_images': True,
            'images_updated_at': datetime.now(timezone.utc).isoformat()
        })
    return success


async def get_story_images(story_id: str, user_id: str) -> List[str]:
    """
    Get all image URLs for a story.
    
    For Story42 API generated images, returns presigned URLs from metadata.
    For legacy images, returns presigned URLs from S3 storage.
    """
    # Verify ownership
    metadata = get_metadata(user_id, story_id)
    if not metadata:
        return []
    
    # Check if metadata has image URLs (Story42 API generated images)
    if "images" in metadata and isinstance(metadata["images"], list):
        refreshed = refresh_presigned_image_urls(metadata["images"], expires_in=60 * 60)
        if refreshed and refreshed != metadata["images"]:
            update_metadata(user_id, story_id, {"images": refreshed})
        return refreshed
    
    # Fallback to S3 storage for legacy images
    return list_images(user_id, story_id)


# ============================================================================
# SESSION OPERATIONS
# ============================================================================

async def create_story_session(session_id: str, user_id: str, topic: str) -> Dict[str, Any]:
    """Create a new story generation session."""
    return create_session(
        session_id=session_id,
        user_id=user_id,
        story_id=session_id,  # Use session_id as story_id
        session_type='story_generation',
        ttl_hours=24
    )


async def update_story_session_status(session_id: str, status: str, **kwargs) -> bool:
    """Update session status and progress."""
    updates = {'status': status, **kwargs}
    return update_session(session_id, updates)


async def get_story_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get session data."""
    return get_session(session_id)

