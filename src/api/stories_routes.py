"""
Stories API endpoints for listing, retrieving, and managing user stories.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List
import logging

from src.auth.cognito_auth import require_auth
from src.tools.integrated_storage import (
    list_user_stories_integrated,
    load_complete_story,
    delete_complete_story,
    get_story_images
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/v1/stories/list")
async def list_stories(user_data: Dict = Depends(require_auth)):
    """
    List all stories for the authenticated user.
    
    Returns:
        List of story summaries
    """
    try:
        user_id = user_data.get("sub")
        logger.info(f"📚 Listing stories for user: {user_id}")
        
        stories = await list_user_stories_integrated(user_id)
        
        logger.info(f"✅ Found {len(stories)} stories for user {user_id}")
        return {"stories": stories}
        
    except Exception as e:
        logger.error(f"❌ Failed to list stories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/stories/{story_id}")
async def get_story(story_id: str, user_data: Dict = Depends(require_auth)):
    """
    Get complete story data including text and metadata.
    
    Args:
        story_id: Story identifier
        
    Returns:
        Complete story data
    """
    try:
        user_id = user_data.get("sub")
        logger.info(f"📖 Loading story {story_id} for user {user_id}")
        
        story = await load_complete_story(story_id, user_id)
        
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        
        return story
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to load story: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/stories/{story_id}/images")
async def get_story_images_endpoint(story_id: str, user_data: Dict = Depends(require_auth)):
    """
    Get all image URLs for a story.
    
    Args:
        story_id: Story identifier
        
    Returns:
        List of image URLs
    """
    try:
        user_id = user_data.get("sub")
        logger.info(f"🖼️ Loading images for story {story_id}")
        
        images = await get_story_images(story_id, user_id)
        
        return {"images": images}
        
    except Exception as e:
        logger.error(f"❌ Failed to load images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/v1/stories/{story_id}")
async def delete_story(story_id: str, user_data: Dict = Depends(require_auth)):
    """
    Delete a story and all associated files.
    
    Args:
        story_id: Story identifier
        
    Returns:
        Success message
    """
    try:
        user_id = user_data.get("sub")
        logger.info(f"🗑️ Deleting story {story_id} for user {user_id}")
        
        success = await delete_complete_story(story_id, user_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Story not found or cannot be deleted")
        
        return {"message": "Story deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to delete story: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def register_stories_routes(app):
    """Register story routes with the FastAPI app."""
    app.include_router(router)
    logger.info("Stories routes registered")

