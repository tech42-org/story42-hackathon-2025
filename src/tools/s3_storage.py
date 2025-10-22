"""
S3 storage operations for story files, audio, and images.

This module handles all S3 operations for storing and retrieving:
- Story text files (story.txt)
- Story JSON data (story.json, metadata.json)
- Audio files (full.wav, HLS segments)
- Image files (generated images)

S3 Structure:
users/{user_id}/stories/{story_id}/
  ├── story.txt
  ├── story.json
  ├── metadata.json
  ├── audio/
  │   ├── full.wav
  │   └── hls/
  │       ├── stream.m3u8
  │       └── segment_*.ts
  └── images/
      ├── 001.png
      └── 002.png
"""

import os
import boto3
import json
from typing import Optional, List, Dict, Any, BinaryIO, Tuple
from botocore.exceptions import ClientError
from pathlib import Path
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Initialize S3 client
s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'us-east-1'))
BUCKET_NAME = os.getenv('S3_STORAGE_BUCKET', 'story-42-story-images-dev')
S3_BASE_PREFIX = os.getenv('S3_BASE_PREFIX', 'AIWorkflow').strip('/')


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _build_prefix(*parts: str) -> str:
    cleaned = [part.strip('/') for part in parts if part]
    return "/".join(cleaned)


def _extract_bucket_key_from_s3_uri(s3_uri: str) -> Tuple[Optional[str], Optional[str]]:
    if not s3_uri:
        return (None, None)

    parsed = urlparse(s3_uri)
    if parsed.scheme != 's3':
        return (None, None)

    bucket = parsed.netloc or None
    key = parsed.path.lstrip('/') if parsed.path else None
    return (bucket, key)


def _extract_bucket_key_from_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    if not url:
        return (None, None)

    parsed = urlparse(url)
    host = parsed.hostname or ''
    path = parsed.path.lstrip('/')

    bucket = None
    key = None

    if '.s3.' in host:
        bucket = host.split('.s3.')[0]
        key = path
    elif host.startswith('s3.') or host.startswith('s3-'):
        parts = path.split('/', 1)
        if len(parts) == 2:
            bucket, key = parts[0], parts[1]
    else:
        parts = path.split('/', 1)
        if len(parts) == 2:
            bucket, key = parts[0], parts[1]

    if not bucket and path:
        bucket = BUCKET_NAME
        key = path

    return (bucket, key)


def _generate_presigned(bucket: str, key: str, expires_in: int = 3600) -> Optional[str]:
    if not bucket or not key:
        return None

    try:
        return s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expires_in
        )
    except ClientError as exc:
        logger.error("❌ Failed to generate presigned URL for %s/%s: %s", bucket, key, exc)
        return None


def get_story_prefix(user_id: str, story_id: str) -> str:
    """Get S3 key prefix for a story."""
    base = _build_prefix(S3_BASE_PREFIX, "users", user_id, "stories", story_id)
    return f"{base}/"


def get_user_stories_prefix(user_id: str) -> str:
    """Get S3 key prefix for all stories of a user."""
    return _build_prefix(S3_BASE_PREFIX, "users", user_id, "stories") + "/"


def upload_file(file_path: str, s3_key: str, content_type: Optional[str] = None) -> bool:
    """
    Upload a file to S3.
    
    Args:
        file_path: Local file path
        s3_key: S3 object key
        content_type: Optional content type
        
    Returns:
        True if successful, False otherwise
    """
    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type
    
    try:
        s3_client.upload_file(file_path, BUCKET_NAME, s3_key, ExtraArgs=extra_args)
        logger.info(f"✅ Uploaded to S3: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to upload to S3: {e}")
        return False


def upload_fileobj(file_obj: BinaryIO, s3_key: str, content_type: Optional[str] = None) -> bool:
    """
    Upload a file object to S3.
    
    Args:
        file_obj: File-like object
        s3_key: S3 object key
        content_type: Optional content type
        
    Returns:
        True if successful, False otherwise
    """
    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type
    
    try:
        s3_client.upload_fileobj(file_obj, BUCKET_NAME, s3_key, ExtraArgs=extra_args)
        logger.info(f"✅ Uploaded to S3: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to upload to S3: {e}")
        return False


def download_file(s3_key: str, local_path: str) -> bool:
    """
    Download a file from S3.
    
    Args:
        s3_key: S3 object key
        local_path: Local file path to save
        
    Returns:
        True if successful, False otherwise
    """
    try:
        s3_client.download_file(BUCKET_NAME, s3_key, local_path)
        logger.info(f"✅ Downloaded from S3: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to download from S3: {e}")
        return False


def get_object(s3_key: str) -> Optional[bytes]:
    """
    Get object content as bytes.
    
    Args:
        s3_key: S3 object key
        
    Returns:
        Object content or None if not found
    """
    try:
        response = s3_client.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        return response['Body'].read()
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return None
        logger.error(f"❌ Failed to get object from S3: {e}")
        return None


def delete_object(s3_key: str) -> bool:
    """
    Delete an object from S3.
    
    Args:
        s3_key: S3 object key
        
    Returns:
        True if successful, False otherwise
    """
    try:
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        logger.info(f"✅ Deleted from S3: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to delete from S3: {e}")
        return False


def list_objects(prefix: str) -> List[str]:
    """
    List objects with a given prefix.
    
    Args:
        prefix: S3 key prefix
        
    Returns:
        List of S3 keys
    """
    try:
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
        if 'Contents' not in response:
            return []
        return [obj['Key'] for obj in response['Contents']]
    except ClientError as e:
        logger.error(f"❌ Failed to list objects from S3: {e}")
        return []


def object_exists(s3_key: str) -> bool:
    """
    Check if an object exists in S3.
    
    Args:
        s3_key: S3 object key
        
    Returns:
        True if exists, False otherwise
    """
    try:
        s3_client.head_object(Bucket=BUCKET_NAME, Key=s3_key)
        return True
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code')
        if error_code in ('404', 'NoSuchKey'):
            return False
        logger.error(f"❌ Failed to check object existence: {e}")
        return False


def get_object_size(s3_key: str) -> Optional[int]:
    """
    Get size of an existing S3 object in bytes.
    Returns None if the object does not exist or size cannot be retrieved.
    """
    try:
        response = s3_client.head_object(Bucket=BUCKET_NAME, Key=s3_key)
        return response.get('ContentLength')
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code')
        if error_code in ('404', 'NoSuchKey'):
            return None
        logger.error(f"❌ Failed to get object size: {e}")
        return None


# ============================================================================
# AUDIO CLEANUP OPERATIONS
# ============================================================================

def delete_audio_files(user_id: str, story_id: str) -> bool:
    """Delete all audio artifacts (MP3, WAV, HLS) for a story."""
    audio_prefix = f"{get_story_prefix(user_id, story_id)}audio/"
    keys = list_objects(audio_prefix)

    if not keys:
        logger.info("No audio objects found in S3 for story %s", story_id)
        return True

    try:
        for index in range(0, len(keys), 1000):
            batch = keys[index:index + 1000]
            s3_client.delete_objects(
                Bucket=BUCKET_NAME,
                Delete={'Objects': [{'Key': key} for key in batch]}
            )
        logger.info("✅ Deleted %d audio objects for story %s", len(keys), story_id)
        return True
    except ClientError as exc:
        logger.error("❌ Failed to delete audio files for story %s: %s", story_id, exc)
        return False


# ============================================================================
# STORY FILE OPERATIONS
# ============================================================================

def save_story_text(user_id: str, story_id: str, content: str) -> bool:
    """
    Save story text to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        content: Story text content
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}story.txt"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=content.encode('utf-8'),
            ContentType='text/plain'
        )
        logger.info(f"✅ Saved story text: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save story text: {e}")
        return False


def get_story_text(user_id: str, story_id: str) -> Optional[str]:
    """
    Get story text from S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        
    Returns:
        Story text or None if not found
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}story.txt"
    content = get_object(s3_key)
    return content.decode('utf-8') if content else None


def save_story_json(user_id: str, story_id: str, data: Dict[str, Any]) -> bool:
    """
    Save story JSON data to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        data: Story data dictionary
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}story.json"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=json.dumps(data, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        logger.info(f"✅ Saved story JSON: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save story JSON: {e}")
        return False


def get_story_json(user_id: str, story_id: str) -> Optional[Dict[str, Any]]:
    """
    Get story JSON data from S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        
    Returns:
        Story data dictionary or None if not found
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}story.json"
    content = get_object(s3_key)
    return json.loads(content.decode('utf-8')) if content else None


def save_metadata(user_id: str, story_id: str, metadata: Dict[str, Any]) -> bool:
    """
    Save story metadata to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        metadata: Metadata dictionary
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}metadata.json"
    try:
        payload = {**metadata}
        payload.setdefault('story_id', story_id)
        payload.setdefault('user_id', user_id)
        payload.setdefault('created_at', datetime.now(timezone.utc).isoformat())
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=json.dumps(payload, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        logger.info(f"✅ Saved metadata: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save metadata: {e}")
        return False


def get_metadata(user_id: str, story_id: str) -> Optional[Dict[str, Any]]:
    """
    Get story metadata from S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        
    Returns:
        Metadata dictionary or None if not found
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}metadata.json"
    content = get_object(s3_key)
    return json.loads(content.decode('utf-8')) if content else None


def update_metadata(user_id: str, story_id: str, updates: Dict[str, Any]) -> bool:
    """Update metadata JSON for a story."""
    current = get_metadata(user_id, story_id) or {}
    current.update(updates)
    current['story_id'] = story_id
    current['user_id'] = user_id
    current['updated_at'] = datetime.now(timezone.utc).isoformat()
    return save_metadata(user_id, story_id, current)


def list_story_metadata(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """List story metadata objects for a user from S3."""
    prefix = get_user_stories_prefix(user_id)
    paginator = s3_client.get_paginator('list_objects_v2')
    collected: List[Dict[str, Any]] = []

    for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if not key.endswith('metadata.json'):
                continue
            meta = get_object(key)
            if not meta:
                continue
            try:
                data = json.loads(meta.decode('utf-8'))
                collected.append(data)
            except json.JSONDecodeError:
                logger.warning(f"Skipping malformed metadata: {key}")
        if len(collected) >= limit:
            break

    collected.sort(key=lambda item: item.get('created_at', ''), reverse=True)
    return collected[:limit]


# ============================================================================
# AUDIO FILE OPERATIONS
# ============================================================================

def save_audio_file(user_id: str, story_id: str, file_path: str, filename: str = "full.wav") -> bool:
    """
    Upload audio file to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        file_path: Local audio file path
        filename: Audio filename (default: full.wav)
        
    Returns:
        True if successful, False otherwise
    """
    # Determine content type based on file extension
    if filename.endswith('.mp3'):
        content_type = 'audio/mpeg'
    elif filename.endswith('.wav'):
        content_type = 'audio/wav'
    else:
        content_type = 'application/octet-stream'
    
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/{filename}"
    return upload_file(file_path, s3_key, content_type=content_type)


def save_hls_playlist(user_id: str, story_id: str, playlist_content: str) -> bool:
    """
    Upload HLS playlist (.m3u8) to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        playlist_content: M3U8 playlist content as string
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/stream.m3u8"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=playlist_content.encode('utf-8'),
            ContentType='application/vnd.apple.mpegurl'
        )
        logger.info(f"✅ Saved HLS playlist: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save HLS playlist: {e}")
        return False


def save_hls_segment(user_id: str, story_id: str, segment_path: str, segment_name: str) -> bool:
    """
    Upload HLS segment (.ts) to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        segment_path: Local segment file path
        segment_name: Segment filename (e.g., segment_001.ts)
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/{segment_name}"
    return upload_file(segment_path, s3_key, content_type='video/mp2t')


def get_hls_playlist_url(user_id: str, story_id: str, expires_in: int = 3600) -> Optional[str]:
    """
    Generate presigned URL for HLS playlist.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        expires_in: URL expiration time in seconds
        
    Returns:
        Presigned URL or None if playlist doesn't exist
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/stream.m3u8"
    
    if not object_exists(s3_key):
        return None
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': s3_key},
            ExpiresIn=expires_in
        )
        return url
    except ClientError as e:
        logger.error(f"❌ Failed to generate presigned URL for HLS playlist: {e}")
        return None


def get_hls_segment_url(user_id: str, story_id: str, segment_name: str, expires_in: int = 3600) -> Optional[str]:
    """
    Generate presigned URL for HLS segment.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        segment_name: Segment filename (e.g., segment_001.ts)
        expires_in: URL expiration time in seconds
        
    Returns:
        Presigned URL or None if segment doesn't exist
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/{segment_name}"
    
    if not object_exists(s3_key):
        return None
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': s3_key},
            ExpiresIn=expires_in
        )
        return url
    except ClientError as e:
        logger.error(f"❌ Failed to generate presigned URL for HLS segment: {e}")
        return None


def get_audio_url(user_id: str, story_id: str, filename: str = "full.wav", expires_in: int = 3600) -> Optional[str]:
    """
    Generate presigned URL for audio file.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        filename: Audio filename
        expires_in: URL expiration time in seconds
        
    Returns:
        Presigned URL or None if file doesn't exist
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/{filename}"
    
    if not object_exists(s3_key):
        return None
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': s3_key},
            ExpiresIn=expires_in
        )
        return url
    except ClientError as e:
        logger.error(f"❌ Failed to generate presigned URL: {e}")
        return None


# ============================================================================
# IMAGE FILE OPERATIONS
# ============================================================================

def save_image(user_id: str, story_id: str, image_data: bytes, image_number: int) -> bool:
    """
    Save generated image to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        image_data: Image binary data
        image_number: Image sequence number
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}images/{image_number:03d}.png"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=image_data,
            ContentType='image/png'
        )
        logger.info(f"✅ Saved image: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save image: {e}")
        return False


def list_images(user_id: str, story_id: str) -> List[str]:
    """
    List all image URLs for a story.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        
    Returns:
        List of presigned image URLs
    """
    prefix = f"{get_story_prefix(user_id, story_id)}images/"
    keys = list_objects(prefix)
    
    urls = []
    for key in keys:
        try:
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': BUCKET_NAME, 'Key': key},
                ExpiresIn=3600
            )
            urls.append(url)
        except ClientError as e:
            logger.error(f"❌ Failed to generate URL for {key}: {e}")
    
    return urls


def refresh_presigned_image_urls(urls: List[str], expires_in: int = 3600) -> List[str]:
    """Refresh presigned URLs that might have expired."""
    refreshed: List[str] = []

    for url in urls:
        bucket, key = _extract_bucket_key_from_url(url)
        if not bucket or not key:
            bucket, key = _extract_bucket_key_from_s3_uri(url)

        if bucket and key:
            new_url = _generate_presigned(bucket, key, expires_in)
            if new_url:
                refreshed.append(new_url)
                continue

        logger.debug("Using original image URL because presign refresh failed")
        refreshed.append(url)

    return refreshed


# ============================================================================
# HLS OPERATIONS
# ============================================================================

def save_hls_playlist(user_id: str, story_id: str, playlist_content: str) -> bool:
    """
    Save HLS playlist to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        playlist_content: M3U8 playlist content
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/stream.m3u8"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=playlist_content.encode('utf-8'),
            ContentType='application/vnd.apple.mpegurl'
        )
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save HLS playlist: {e}")
        return False


def save_hls_segment(user_id: str, story_id: str, segment_data: bytes, segment_name: str) -> bool:
    """
    Save HLS segment to S3.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        segment_data: Segment binary data
        segment_name: Segment filename
        
    Returns:
        True if successful, False otherwise
    """
    s3_key = f"{get_story_prefix(user_id, story_id)}audio/hls/{segment_name}"
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=segment_data,
            ContentType='video/MP2T'
        )
        return True
    except ClientError as e:
        logger.error(f"❌ Failed to save HLS segment: {e}")
        return False


# ============================================================================
# CLEANUP OPERATIONS
# ============================================================================

def delete_story_files(user_id: str, story_id: str) -> bool:
    """
    Delete all files for a story.
    
    Args:
        user_id: User identifier
        story_id: Story identifier
        
    Returns:
        True if successful, False otherwise
    """
    prefix = get_story_prefix(user_id, story_id)
    keys = set(list_objects(prefix))
    # Ensure core metadata/text assets are always included
    keys.update({
        f"{prefix}metadata.json",
        f"{prefix}story.json",
        f"{prefix}story.txt",
    })

    batch_keys = [key for key in keys if key]
    if not batch_keys:
        return True

    success = True
    try:
        for i in range(0, len(batch_keys), 1000):
            batch = batch_keys[i:i + 1000]
            response = s3_client.delete_objects(
                Bucket=BUCKET_NAME,
                Delete={'Objects': [{'Key': key} for key in batch], 'Quiet': False}
            )
            errors = response.get('Errors') or []
            if errors:
                success = False
                logger.error(f"❌ Failed to delete some story objects: {errors}")
        if success:
            logger.info(f"✅ Deleted {len(batch_keys)} objects for story {story_id}")
        return success
    except ClientError as e:
        logger.error(f"❌ Failed to delete story files: {e}")
        return False

