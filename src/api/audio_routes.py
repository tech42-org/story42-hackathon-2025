"""
Audio generation API endpoints.

Provides endpoints for TTS generation, status checking, and audio download.
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response, PlainTextResponse
from pathlib import Path
import os
import json
import logging
import shutil
from typing import Dict, Optional, Any

from src.tools.tts_streaming import get_tts_streamer
from src.tools.file_storage import load_story_from_file
from src.tools.integrated_storage import load_complete_story
from src.auth.cognito_auth import require_auth
from fastapi import Depends
from src.tools import s3_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/audio", tags=["audio"])


def _cleanup_audio_assets(session_id: str, user_id: Optional[str]) -> bool:
    """Delete all generated audio assets for a session locally and in S3."""
    storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
    audio_dir = storage_root / 'audio' / session_id

    if audio_dir.exists():
        try:
            shutil.rmtree(audio_dir)
            logger.info(f"🧹 Removed local audio assets for session {session_id}")
        except Exception as exc:
            logger.error(f"❌ Failed to remove local audio assets for session {session_id}: {exc}")
            # Continue with S3 cleanup even if local deletion fails

    if user_id:
        deleted = s3_storage.delete_audio_files(user_id, session_id)
        if not deleted:
            logger.error(f"❌ Failed to delete S3 audio assets for session {session_id}")
            return False

    return True


@router.post("/generate/{session_id}")
async def generate_audio_stream(
    session_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user_data: Dict = Depends(require_auth),
    body: Optional[Dict[str, Any]] = None
):
    """
    Generate audio in the background (independent of HTTP connection).
    
    This endpoint triggers audio generation as a background task, allowing:
    1. Page refresh without stopping generation
    2. Closing the browser without stopping generation
    3. Checking existing audio and serving it immediately
    
    The frontend should:
    1. Call this endpoint to start generation
    2. Poll /status/{session_id} to track progress
    3. Load HLS stream when status shows sufficient audio (~10s)
    
    Args:
        session_id: Story session identifier
        background_tasks: FastAPI background tasks manager
    
    Returns:
        Immediate status response (generation continues in background)
    """
    logger.info(f"🎬 /generate/{session_id} endpoint called!")
    try:
        user_id = user_data.get("sub")

        # Check if user wants to force regeneration
        has_body = body and isinstance(body, dict)
        force_regenerate = bool(has_body and body.get("force_regenerate"))
        if has_body and body.get("speaker_voice_overrides"):
            force_regenerate = True

        # Production check: if audio exists in S3, do not regenerate unless forced
        if not force_regenerate and user_id:
            mp3_url = s3_storage.get_audio_url(user_id, session_id, "final.mp3", expires_in=3600)
            if mp3_url:
                logger.info(f"✓ MP3 already exists in S3 for {session_id}; returning existing audio")
                return {
                    "status": "ready",
                    "session_id": session_id,
                    "message": "Audio already generated",
                    "url": mp3_url,
                    "source": "s3"
                }

            wav_url = s3_storage.get_audio_url(user_id, session_id, "progressive.wav", expires_in=3600)
            if wav_url:
                logger.info(f"⏳ Progressive WAV exists in S3 for {session_id}; generation in progress")
                return {
                    "status": "generating",
                    "session_id": session_id,
                    "message": "Audio generation already in progress",
                    "url": wav_url,
                    "source": "s3"
                }

        # Local filesystem check (development fallback)
        storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
        audio_dir = storage_root / 'audio' / session_id
        final_mp3 = audio_dir / 'final.mp3'
        progressive_wav = audio_dir / 'progressive.wav'
        
        # If audio already complete and not forcing regeneration, return status
        if final_mp3.exists() and not force_regenerate:
            logger.info(f"✓ MP3 already exists for {session_id}")
            return {
                "status": "ready",
                "session_id": session_id,
                "message": "Audio already generated",
                "url": f"/api/v1/audio/stream/{session_id}",
                "source": "local"
            }
        
        # If generation in progress (progressive WAV exists and recently modified) and not forcing regeneration
        if progressive_wav.exists() and not force_regenerate:
            import time
            mtime = progressive_wav.stat().st_mtime
            age = time.time() - mtime
            if age < 30:  # Modified in last 30 seconds = still generating
                logger.info(f"✓ Generation already in progress for {session_id} (file age: {age:.1f}s)")
                return {
                    "status": "generating",
                    "session_id": session_id,
                    "message": "Audio generation already in progress"
                }
        
        # Clean up old audio files if regenerating
        if force_regenerate:
            logger.info(f"🔄 Force regenerating audio for {session_id}...")
            cleanup_success = _cleanup_audio_assets(session_id, user_data.get("sub"))
            if not cleanup_success:
                raise HTTPException(status_code=500, detail="Failed to reset previous audio assets. Please try again")
        
        # No existing audio or stale generation - start new generation
        logger.info(f"🎵 Starting new audio generation for {session_id}...")
        
        # Load story from integrated storage (DynamoDB + S3)
        user_id = user_data.get("sub")
        story_data = await load_complete_story(session_id, user_id)
        
        if not story_data:
            logger.error(f"❌ Story not found in S3/DynamoDB for {session_id}")
            raise HTTPException(status_code=404, detail=f"Story not found: {session_id}")
        
        # Extract optional speaker overrides from request body
        speaker_overrides = None
        if body and isinstance(body, dict):
            speaker_overrides = body.get("speaker_voice_overrides")

        # Determine API key source (header takes precedence, then body)
        tech42_tts_api_key = request.headers.get("X-Tech42-TTS-Key")
        if not tech42_tts_api_key and body and isinstance(body, dict):
            tech42_tts_api_key = body.get("tech42_tts_api_key") or body.get("tech42_tts_key")

        # Try to load structured story first, fall back to plain text
        from src.agents.story_models import StoryStructure
        structured_story = story_data.get('structured_story')
        
        if structured_story:
            # We have structured story - use it!
            try:
                story_input = StoryStructure(**structured_story)
                logger.info(f"✅ Structured story loaded: {len(story_input.chapters)} chapters, {len(story_input.characters)} characters")
            except Exception as e:
                logger.warning(f"⚠️ Failed to parse structured story: {e}, falling back to text")
                story_input = story_data.get('story', story_data.get('content', ''))
        else:
            # Fallback to plain text
            story_input = story_data.get('story', story_data.get('content', ''))
            logger.info(f"⚠️ No structured story found, using plain text ({len(story_input)} chars)")
        
        if not story_input:
            logger.error(f"❌ Story not found for {session_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Story not found for session {session_id}"
            )
        
        story_length = len(story_input.chapters) if isinstance(story_input, StoryStructure) else len(story_input)
        logger.info(f"✅ Story loaded, starting background TTS")
        
        # Get TTS streamer
        tts_streamer = get_tts_streamer()
        
        # Trigger generation as background task (runs independently of HTTP connection)
        background_tasks.add_task(
            _run_audio_generation_background,
            tts_streamer=tts_streamer,
            story_input=story_input,
            session_id=session_id,
            user_id=user_id,
            speaker_voice_overrides=speaker_overrides,
            tech42_tts_api_key=tech42_tts_api_key
        )
        
        # Return immediately - generation continues in background
        return {
            "status": "started",
            "session_id": session_id,
            "message": "Audio generation started in background. Poll /status to track progress."
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start audio generation: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Audio generation failed to start: {str(e)}"
        )


@router.post("/reset/{session_id}")
async def reset_audio_session(session_id: str, user_data: Dict = Depends(require_auth)):
    """Reset audio assets so the user can regenerate from scratch."""
    user_id = user_data.get("sub")
    logger.info(f"♻️ reset_audio_session called for {session_id} by user {user_id}")

    cleanup_success = _cleanup_audio_assets(session_id, user_id)
    if not cleanup_success:
        raise HTTPException(status_code=500, detail="Failed to remove existing audio assets")

    return {"status": "reset", "session_id": session_id}


async def _run_audio_generation_background(
    tts_streamer,
    story_input,
    session_id: str,
    user_id: str,
    speaker_voice_overrides: Optional[Dict[str, str]] = None,
    tech42_tts_api_key: Optional[str] = None
):
    """
    Run audio generation in the background, independent of HTTP connection.
    
    This function consumes the audio generation stream and discards the chunks,
    since we're writing directly to files (progressive.wav and HLS segments).
    The client polls /status to track progress.
    
    Args:
        tts_streamer: TTSStreamer instance
        story_input: Either StoryStructure object or plain text string
        session_id: Session identifier
        user_id: User identifier for S3 storage paths
    
    CRITICAL: This function MUST NOT crash or raise exceptions, as it runs in a
    background task and could crash the entire server if unhandled.
    """
    chunk_count = 0
    try:
        from src.agents.story_models import StoryStructure
        
        logger.info(f"🎙️  Background task started for session {session_id}")
        if isinstance(story_input, StoryStructure):
            logger.info(f"  Story type: Structured ({len(story_input.chapters)} chapters, {len(story_input.characters)} characters)")
        else:
            logger.info(f"  Story type: Plain text ({len(story_input)} chars)")
        
        # Consume the generator (audio is written to files and uploaded to S3)
        try:
            async for chunk in tts_streamer.stream_audio_generation(
                story_input=story_input,
                session_id=session_id,
                user_id=user_id,
                speaker_voice_overrides=speaker_voice_overrides,
                api_key_override=tech42_tts_api_key
            ):
                chunk_count += 1
                # Chunks are being written to disk, we just need to consume the generator
                if chunk_count % 100 == 0:
                    logger.info(f"  Background progress: {chunk_count} chunks ({chunk_count * 8192 // 1024}KB)")
        except Exception as stream_err:
            logger.error(f"❌ Stream generation error", exc_info=True)
            raise  # Re-raise to outer handler for logging
        
        logger.info(f"🎉 ✅ Background task complete for session {session_id}")
        logger.info(f"  Total chunks consumed: {chunk_count}")
        
    except Exception as e:
        logger.error(f"💥 ❌ Background task crashed for session {session_id}", exc_info=True)
        try:
            logger.error(f"  Chunks processed before crash: {chunk_count}")
            logger.error(f"  Exception type: {type(e).__name__}")
            logger.error(f"  Exception message: {str(e)}")
        except Exception as log_err:
            logger.error(f"  (Could not log error details: {log_err})")
        # ABSOLUTELY DO NOT RE-RAISE - background task must not crash the server
    finally:
        try:
            logger.info(f"🏁 Background task exiting for session {session_id} (processed {chunk_count} chunks)")
        except:
            pass  # Even logging in finally can't be allowed to crash


@router.get("/status/{session_id}")
async def get_audio_status(session_id: str, request: Request, user_data: Dict = Depends(require_auth)):
    """
    Check audio generation status for a session.
    
    Checks S3 first (production), then falls back to local storage (development).
    
    Args:
        session_id: Story session identifier
    
    Returns:
        Status object with:
        - status: 'ready' | 'processing' | 'not_generated'
        - url: S3 presigned URL or local endpoint (if ready or processing)
        - duration_seconds: Audio duration (if available)
        - file_type: 'mp3' | 'wav' (indicates conversion status)
    """
    from src.tools import s3_storage
    
    user_id = user_data.get("sub")
    tts_streamer = get_tts_streamer()
    
    # PRODUCTION: Check S3 for audio files (preferred)
    # Priority 1: Check for MP3 in S3
    mp3_url = s3_storage.get_audio_url(user_id, session_id, "final.mp3", expires_in=3600)
    if mp3_url:
        logger.info(f"✓ Status check: MP3 ready in S3 for {session_id}")
        return {
            "status": "ready",
            "url": mp3_url,  # Presigned S3 URL
            "duration_seconds": 0.0,  # Can be fetched from metadata if needed
            "file_type": "mp3",
            "source": "s3"
        }
    
    # Priority 2: Check for WAV in S3 (still generating or MP3 conversion pending)
    wav_url = s3_storage.get_audio_url(user_id, session_id, "progressive.wav", expires_in=3600)
    if wav_url:
        logger.info(f"⏳ Status check: WAV ready in S3 for {session_id} (MP3 conversion may be pending)")
        return {
            "status": "ready",
            "url": wav_url,  # Presigned S3 URL
            "duration_seconds": 0.0,
            "file_type": "wav",
            "source": "s3"
        }
    
    # DEVELOPMENT FALLBACK: Check local filesystem
    storage_root = Path(os.getenv('STORAGE_ROOT', './storage'))
    session_dir = storage_root / 'audio' / session_id
    mp3_path = session_dir / 'final.mp3'
    progressive_wav_path = session_dir / 'progressive.wav'
    
    # Check local MP3
    if mp3_path.exists():
        file_size = mp3_path.stat().st_size
        duration = 0.0
        
        try:
            duration = tts_streamer._get_audio_duration(mp3_path)
        except Exception as e:
            logger.warning(f"Could not get MP3 duration: {e}")
        
        logger.info(f"✓ Status check: MP3 ready locally for {session_id} ({duration:.1f}s, {file_size:,} bytes)")
        
        return {
            "status": "ready",
            "url": f"/api/v1/audio/stream/{session_id}",
            "file_size_bytes": file_size,
            "duration_seconds": duration,
            "file_type": "mp3"
        }
    
    # Priority 2: Progressive WAV exists (may be generating or complete)
    elif progressive_wav_path.exists():
        file_size = progressive_wav_path.stat().st_size
        duration = 0.0
        
        try:
            duration = tts_streamer._get_audio_duration(progressive_wav_path)
        except Exception as e:
            logger.warning(f"Could not get WAV duration (file may be growing): {e}")
        
        # Determine if still generating by checking if file was modified recently
        # Using a shorter window (3 seconds) to quickly transition to "ready" status
        import time
        file_mtime = progressive_wav_path.stat().st_mtime
        time_since_modification = time.time() - file_mtime
        is_generating = time_since_modification < 3  # File modified in last 3 seconds
        
        if is_generating:
            logger.info(f"⏳ Status check: Audio generating for {session_id} ({duration:.1f}s so far, {file_size:,} bytes, modified {time_since_modification:.1f}s ago)")
            status = "generating"
        else:
            logger.info(f"✓ Status check: Progressive WAV complete for {session_id} ({duration:.1f}s, {file_size:,} bytes, modified {time_since_modification:.1f}s ago)")
            status = "ready"
        
        return {
            "status": status,
            "url": f"/api/v1/audio/stream/{session_id}",
            "file_size_bytes": file_size,
            "duration_seconds": duration,
            "file_type": "wav"
        }
    
    # No audio files found
    else:
        logger.info(f"✗ Status check: No audio found for {session_id}")
        return {
            "status": "not_generated"
        }


@router.get("/stream/{session_id}")
async def stream_audio(session_id: str, request: Request):
    """
    Stream audio file with Range request support for progressive playback.
    
    This endpoint serves the audio file (MP3 or progressive WAV) with proper
    Range header support, allowing:
    - Progressive playback as file grows during generation
    - Seeking in the audio timeline
    - Resuming playback after page refresh
    
    Args:
        session_id: Story session identifier
        request: FastAPI request object (for Range header)
    
    Returns:
        Audio file with Range support (206 Partial Content or 200 OK)
    
    Example:
        ```html
        <audio controls src="/api/v1/audio/stream/abc123"></audio>
        ```
    """
    storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
    session_dir = storage_root / 'audio' / session_id
    
    # Check for audio files in priority order: MP3 > progressive WAV
    mp3_path = session_dir / 'final.mp3'
    progressive_wav_path = session_dir / 'progressive.wav'
    
    audio_path = None
    media_type = "audio/mpeg"
    
    if mp3_path.exists():
        audio_path = mp3_path
        media_type = "audio/mpeg"
        logger.info(f"📡 Streaming MP3 for {session_id}")
    elif progressive_wav_path.exists():
        audio_path = progressive_wav_path
        media_type = "audio/wav"
        logger.info(f"📡 Streaming progressive WAV for {session_id}")
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Audio file not found for session {session_id}"
        )
    
    # Get file size
    file_size = audio_path.stat().st_size
    
    # Handle Range requests for seeking and progressive playback
    range_header = request.headers.get('range')
    
    if range_header:
        # Parse Range header (e.g., "bytes=0-1023")
        try:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else file_size - 1
            end = min(end, file_size - 1)
            
            # Read requested range
            with open(audio_path, 'rb') as f:
                f.seek(start)
                data = f.read(end - start + 1)
            
            logger.debug(f"📡 Range request: bytes {start}-{end}/{file_size}")
            
            # Return partial content with Range headers
            return Response(
                content=data,
                status_code=206,  # Partial Content
                headers={
                    'Content-Type': media_type,
                    'Content-Range': f'bytes {start}-{end}/{file_size}',
                    'Content-Length': str(len(data)),
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
                }
            )
        except Exception as e:
            logger.warning(f"⚠️ Range request parsing failed: {e}, falling back to full file")
    
    # No Range request - return full file
    return FileResponse(
        path=str(audio_path),
        media_type=media_type,
        filename=f"story_{session_id}.{'mp3' if mp3_path.exists() else 'wav'}",
        headers={
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Accept-Ranges'
        }
    )


@router.get("/download/{session_id}")
async def download_audio(session_id: str):
    """
    Download generated audio file (MP3).
    
    Args:
        session_id: Story session identifier
    
    Returns:
        MP3 audio file
    
    Example:
        ```html
        <audio controls src="/api/v1/audio/abc123/download"></audio>
        ```
        
        Or for download:
        ```javascript
        window.open('/api/v1/audio/abc123/download', '_blank')
        ```
    """
    storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
    audio_path = storage_root / 'audio' / session_id / 'final.mp3'
    
    logger.info(f"Looking for audio at: {audio_path}")
    logger.info(f"File exists: {audio_path.exists()}")
    
    if not audio_path.exists():
        # Also check without .mp3 extension (might be .wav)
        wav_path = storage_root / 'audio' / session_id / 'final.wav'
        logger.info(f"Checking WAV fallback: {wav_path}")
        if wav_path.exists():
            audio_path = wav_path
            logger.info(f"Using WAV file instead: {wav_path}")
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Audio file not found for session {session_id}"
            )
    
    return FileResponse(
        path=str(audio_path),
        media_type="audio/mpeg",
        filename=f"story_{session_id}.mp3",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache"
        }
    )


@router.get("/voices")
async def list_available_voices(request: Request, user_data: Dict = Depends(require_auth)):
    """Return the available Tech42 TTS voices."""
    tts_streamer = get_tts_streamer()
    api_key = (
        request.headers.get("X-Tech42-TTS-Key")
        or user_data.get("tech42_tts_api_key")
    )
    force_refresh = request.query_params.get("force", "").lower() in {"1", "true", "yes", "force"}
    try:
        voices = await tts_streamer.get_voice_catalog(
            force_refresh=force_refresh,
            api_key_override=api_key
        )
        return {"voices": voices, "key_required": False}
    except ValueError:
        logger.warning("Tech42 TTS API key missing; returning empty voice list")
        return {"voices": [], "key_required": True}


@router.get("/hls/{session_id}/stream.m3u8")
async def get_hls_playlist(session_id: str, user_data: Dict = Depends(require_auth)):
    """
    Serve HLS playlist (.m3u8) for progressive audio streaming from S3.
    
    Returns a modified playlist with presigned S3 URLs for segments.
    
    Args:
        session_id: Story session identifier
        
    Returns:
        HLS playlist (m3u8) with presigned S3 URLs for segments
    """
    from src.tools import s3_storage
    import re
    
    try:
        user_id = user_data.get("sub")
        
        # Try to get playlist from S3 first
        playlist_url = s3_storage.get_hls_playlist_url(user_id, session_id, expires_in=3600)
        
        if playlist_url:
            # Fetch playlist content from S3
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(playlist_url)
                response.raise_for_status()
                content = response.text
            
            # Keep segment names as-is (they'll be proxied through our backend)
            # This allows HLS.js to use standard relative URLs
            # The segment endpoint will fetch from S3 and serve them
            
            logger.info(f"📡 Serving HLS playlist from S3 for {session_id}")
            logger.debug(f"  Playlist content (first 200 chars): {content[:200]}")
            return PlainTextResponse(
                content=content,
                media_type="application/vnd.apple.mpegurl",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache"
                }
            )
        
        # FALLBACK: Serve from local filesystem (development)
        storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
        audio_dir = storage_root / 'audio' / session_id
        hls_dir = audio_dir / "hls"
        playlist_path = hls_dir / "stream.m3u8"
        
        if not playlist_path.exists():
            logger.warning(f"HLS playlist not found for {session_id}")
            raise HTTPException(status_code=404, detail="HLS stream not available")
        
        logger.info(f"📡 Serving HLS playlist locally for {session_id}")
        
        # Read playlist content
        with open(playlist_path, 'r') as f:
            content = f.read()
        
        return PlainTextResponse(
            content=content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Access-Control-Allow-Origin": "*"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving HLS playlist: {e}")
        raise HTTPException(status_code=500, detail="Failed to serve HLS playlist")


@router.get("/hls/{session_id}/{segment_file}")
async def get_hls_segment(session_id: str, segment_file: str, user_data: Dict = Depends(require_auth)):
    """
    Serve HLS audio segment (.ts) for progressive streaming.
    
    Checks S3 first (production), then falls back to local storage (development).
    
    Args:
        session_id: Story session identifier
        segment_file: Segment filename (e.g., "segment_000.ts")
        
    Returns:
        Audio segment file
    """
    from src.tools import s3_storage
    
    try:
        # Validate segment filename (security: prevent directory traversal)
        if not segment_file.startswith("segment_") or not segment_file.endswith(".ts"):
            raise HTTPException(status_code=400, detail="Invalid segment filename")
        
        user_id = user_data.get("sub")
        
        # PRODUCTION: Try to redirect to S3 presigned URL
        segment_url = s3_storage.get_hls_segment_url(user_id, session_id, segment_file, expires_in=3600)
        if segment_url:
            logger.debug(f"📦 Redirecting to S3 for segment: {segment_file}")
            # Redirect to S3 presigned URL
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=segment_url, status_code=302)
        
        # DEVELOPMENT FALLBACK: Serve from local filesystem
        storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
        audio_dir = storage_root / 'audio' / session_id
        hls_dir = audio_dir / "hls"
        segment_path = hls_dir / segment_file
        
        if not segment_path.exists():
            logger.warning(f"HLS segment not found locally: {segment_file}")
            raise HTTPException(status_code=404, detail="Segment not found")
        
        logger.debug(f"📦 Serving HLS segment locally: {segment_file}")
        
        return FileResponse(
            path=segment_path,
            media_type="video/mp2t",  # MPEG-TS media type
            headers={
                "Cache-Control": "public, max-age=31536000",  # Segments are immutable
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving HLS segment: {e}")
        raise HTTPException(status_code=500, detail="Failed to serve segment")


def register_audio_routes(app):
    """Register audio routes with FastAPI app."""
    app.include_router(router)
    logger.info("Audio routes registered")

