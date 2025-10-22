"""
File storage for generated stories and assets.

Provides local filesystem storage for development and easy migration to S3 for production.
"""

import os
import json
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, UTC

# Storage configuration
STORAGE_ROOT = Path(os.getenv('STORAGE_ROOT', './storage'))
STORIES_DIR = STORAGE_ROOT / 'stories'
IMAGES_DIR = STORAGE_ROOT / 'images'
AUDIO_DIR = STORAGE_ROOT / 'audio'


async def save_story_to_file(session_id: str, story_data: Dict) -> Dict:
    """
    Save generated story to filesystem.
    
    Args:
        session_id: Unique session identifier
        story_data: Dictionary containing story content and metadata
    
    Returns:
        Dictionary with file paths and metadata
    """
    # Create directory
    story_dir = STORIES_DIR / session_id
    story_dir.mkdir(parents=True, exist_ok=True)
    
    # Save plain text version
    story_txt_path = story_dir / 'story.txt'
    with open(story_txt_path, 'w', encoding='utf-8') as f:
        f.write(story_data.get('story', ''))
    
    # Save JSON with full data
    story_json_path = story_dir / 'story.json'
    with open(story_json_path, 'w', encoding='utf-8') as f:
        json.dump(story_data, f, indent=2, ensure_ascii=False)
    
    # Save metadata
    metadata = {
        'session_id': session_id,
        'topic': story_data.get('topic', ''),
        'story_type': story_data.get('story_type', ''),
        'word_count': len(story_data.get('story', '').split()),
        'chapters': story_data.get('chapters', []),
        'generated_at': datetime.now(UTC).isoformat(),
        'agents_used': story_data.get('agents_used', [])
    }
    
    metadata_path = story_dir / 'metadata.json'
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    
    return {
        'story_txt_path': str(story_txt_path),
        'story_json_path': str(story_json_path),
        'metadata_path': str(metadata_path),
        'session_id': session_id
    }


async def load_story_from_file(session_id: str) -> Dict:
    """
    Load story from filesystem.
    
    Args:
        session_id: Unique session identifier
    
    Returns:
        Story data dictionary
    
    Raises:
        FileNotFoundError: If story not found
    """
    story_path = STORIES_DIR / session_id / 'story.json'
    
    if not story_path.exists():
        raise FileNotFoundError(f"Story not found: {session_id}")
    
    with open(story_path, 'r', encoding='utf-8') as f:
        return json.load(f)


async def list_all_stories(limit: int = 50) -> List[Dict]:
    """
    List all stored stories.
    
    Args:
        limit: Maximum number of stories to return
    
    Returns:
        List of story metadata dictionaries
    """
    stories = []
    
    if not STORIES_DIR.exists():
        return stories
    
    for session_dir in STORIES_DIR.iterdir():
        if session_dir.is_dir():
            metadata_path = session_dir / 'metadata.json'
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                    stories.append(metadata)
    
    # Sort by generation date (newest first)
    stories.sort(key=lambda x: x.get('generated_at', ''), reverse=True)
    
    return stories[:limit]


async def save_image_to_file(
    session_id: str,
    scene_id: str,
    image_data: bytes,
    image_format: str = 'png'
) -> Dict:
    """
    Save generated image to filesystem.
    
    Args:
        session_id: Story session identifier
        scene_id: Scene/chapter identifier
        image_data: Raw image bytes
        image_format: Image format (png, jpg, webp)
    
    Returns:
        Dictionary with image path and metadata
    """
    # Create directory
    image_dir = IMAGES_DIR / session_id
    image_dir.mkdir(parents=True, exist_ok=True)
    
    # Save image
    image_path = image_dir / f"{scene_id}.{image_format}"
    with open(image_path, 'wb') as f:
        f.write(image_data)
    
    # Update manifest
    manifest_path = image_dir / 'manifest.json'
    manifest = {}
    
    if manifest_path.exists():
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
    
    manifest[scene_id] = {
        'filename': f"{scene_id}.{image_format}",
        'path': str(image_path),
        'format': image_format,
        'generated_at': datetime.now(UTC).isoformat()
    }
    
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    return {
        'image_path': str(image_path),
        'scene_id': scene_id,
        'url': f"/api/v1/images/{session_id}/{scene_id}.{image_format}"
    }


async def get_story_images(session_id: str) -> List[Dict]:
    """
    Get all images for a story.
    
    Args:
        session_id: Story session identifier
    
    Returns:
        List of image metadata dictionaries
    """
    image_dir = IMAGES_DIR / session_id
    
    if not image_dir.exists():
        return []
    
    manifest_path = image_dir / 'manifest.json'
    
    if not manifest_path.exists():
        return []
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
        return [
            {
                'scene_id': scene_id,
                'url': f"/api/v1/images/{session_id}/{info['filename']}",
                'path': info['path'],
                'generated_at': info.get('generated_at')
            }
            for scene_id, info in manifest.items()
        ]


async def delete_story_files(session_id: str) -> Dict:
    """
    Delete all files associated with a story session.
    
    Args:
        session_id: Story session identifier
    
    Returns:
        Dictionary with deletion status
    """
    import shutil
    
    deleted_items = []
    
    # Delete story files
    story_dir = STORIES_DIR / session_id
    if story_dir.exists():
        shutil.rmtree(story_dir)
        deleted_items.append('stories')
    
    # Delete image files
    image_dir = IMAGES_DIR / session_id
    if image_dir.exists():
        shutil.rmtree(image_dir)
        deleted_items.append('images')
    
    # Delete audio files
    audio_dir = AUDIO_DIR / session_id
    if audio_dir.exists():
        shutil.rmtree(audio_dir)
        deleted_items.append('audio')
    
    return {
        'session_id': session_id,
        'deleted': deleted_items,
        'success': len(deleted_items) > 0
    }


def init_storage():
    """Initialize storage directories on application startup."""
    directories = [STORIES_DIR, IMAGES_DIR, AUDIO_DIR, Path('./sessions')]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
    
    return {
        'storage_root': str(STORAGE_ROOT),
        'stories_dir': str(STORIES_DIR),
        'images_dir': str(IMAGES_DIR),
        'audio_dir': str(AUDIO_DIR),
        'initialized': True
    }


# Export functions
__all__ = [
    'save_story_to_file',
    'load_story_from_file',
    'list_all_stories',
    'save_image_to_file',
    'get_story_images',
    'delete_story_files',
    'init_storage',
]

