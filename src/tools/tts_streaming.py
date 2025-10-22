"""
TTS (Text-to-Speech) streaming using Tech42 TTS API.

Streams audio in real-time to the browser while simultaneously saving to disk.
Users can pause playback (generation continues) and replay completed audio.
"""

import logging
import asyncio
from typing import AsyncGenerator, Dict, List, Tuple, Union, Optional, TYPE_CHECKING
import os
from pathlib import Path
import httpx
import json
import subprocess
import threading
import time

if TYPE_CHECKING:
    from src.agents.story_models import StoryStructure

logger = logging.getLogger(__name__)


class TTSStreamer:
    """Handle TTS audio generation using Tech42 TTS API with real-time streaming."""
    
    def __init__(self):
        self.api_url = self._load_api_url()
        self.default_api_key = self._load_default_api_key()
        self.default_voice = self._load_default_voice()
        
        # Voice mapping for different speakers (can be configured via env vars)
        # Speaker 1 is ALWAYS the narrator
        # Tech42 TTS supports 4 speakers total: 1 narrator + 3 characters
        self.speaker_voices = {
            "Speaker 1": self.default_voice,  # Narrator voice
            "Speaker 2": self._load_speaker_override('2', 'en-Bob_man'),
            "Speaker 3": self._load_speaker_override('3', 'en-Claire_woman'),
            "Speaker 4": self._load_speaker_override('4', 'en-David_man')
        }
        
        # Storage paths
        storage_root = Path(os.getenv('STORAGE_ROOT', './storage')).absolute()
        self.audio_dir = storage_root / 'audio'
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        
        self._voices_cache: Dict[str, Tuple[float, List[Dict[str, str]]]] = {}

    def _load_env_value(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Return environment variable value for Tech42 TTS configuration."""
        value = os.getenv(name)
        if value:
            return value

        if default is not None:
            logger.warning(
                "Environment variable %s not set; falling back to default value.",
                name,
            )

        return default

    def _load_api_url(self) -> str:
        return self._load_env_value(
            'TECH42_TTS_API_URL',
            'http://tech42-tts-gpu-alb-1201907864.us-east-1.elb.amazonaws.com:82'
        )

    def _load_default_api_key(self) -> Optional[str]:
        return self._load_env_value('TECH42_TTS_API_KEY')

    def _load_default_voice(self) -> str:
        return self._load_env_value('TECH42_TTS_DEFAULT_VOICE', 'en-Alice_woman')

    def _load_speaker_override(self, speaker_index: str, default_voice: str) -> str:
        return self._load_env_value(
            f'TECH42_TTS_SPEAKER{speaker_index}',
            default_voice
        )

    async def get_voice_catalog(
        self,
        force_refresh: bool = False,
        api_key_override: Optional[str] = None
    ) -> List[Dict[str, str]]:
        import time

        api_key = api_key_override or self.default_api_key
        if not api_key:
            raise ValueError("Tech42 TTS API key is required")

        cache_entry = self._voices_cache.get(api_key)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.api_url}/voices",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPStatusError, httpx.RequestError) as err:
            logger.error("Failed to fetch voice catalog: %s", err)
            if cache_entry:
                logger.info(
                    "Returning cached voice catalog (%d voices) after fetch failure",
                    len(cache_entry[1])
                )
                return cache_entry[1]
            return []

        if isinstance(payload, dict):
            voices = payload.get("voices", [])
        elif isinstance(payload, list):
            voices = payload
        else:
            logger.warning(
                "Unexpected voice catalog response type %s; defaulting to empty list",
                type(payload)
            )
            voices = []

        self._voices_cache[api_key] = (time.time(), voices)
        return voices

    # Removed: _extract_speakers_and_format() - replaced with structured output
    # The story now uses Pydantic models (StoryStructure) which provide clean,
    # type-safe data without needing regex parsing. See src/agents/story_models.py
    
    async def stream_audio_generation(
        self,
        story_input: Union[str, 'StoryStructure'],
        session_id: str,
        user_id: Optional[str] = None,
        speaker_voice_overrides: Optional[Dict[str, str]] = None,
        api_key_override: Optional[str] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream audio generation in real-time from Tech42 TTS to browser.

        This uses Tech42 TTS's /generate/stream endpoint to get audio chunks
        as they're generated. The chunks are:
        1. Yielded immediately to frontend (real-time playback)
        2. Saved to disk in parallel (for later replay)
        3. Uploaded to S3 after generation (if user_id provided)
        
        Args:
            story_text: Full story text to convert to speech
            session_id: Unique session identifier for storage
            user_id: Optional user identifier for S3 upload
        
        Yields:
            Raw audio chunks (WAV format) for browser playback
        """
        try:
            logger.info(f"🎵 ===== TTS STREAM GENERATION STARTED =====")
            logger.info(f"📝 Session ID: {session_id}")
            logger.info(f"📝 Story input type: {type(story_input)}")
            
            # Format story for TTS based on input type
            from src.agents.story_models import StoryStructure
            
            if isinstance(story_input, StoryStructure):
                # Use structured story's built-in TTS formatting (NO REGEX!)
                formatted_script, speaker_names, speaker_mapping = story_input.to_tts_script()
                
                # Map speaker names to voice models (apply overrides if supplied)
                speaker_voices_list = []
                overrides = speaker_voice_overrides or {}
                
                # Build reverse mapping: Speaker N -> Character Name
                reverse_mapping = {v: k for k, v in speaker_mapping.items()}
                
                for speaker in speaker_names:
                    # speaker is like "Speaker 1", "Speaker 2", etc.
                    # Look up the character name for this speaker number
                    character_name = reverse_mapping.get(speaker, speaker)
                    
                    # Check if user overrode the voice for this character
                    override_voice = overrides.get(character_name)
                    if override_voice:
                        speaker_voices_list.append(override_voice)
                        logger.debug(f"  Using override for {character_name} ({speaker}): {override_voice}")
                    elif speaker in self.speaker_voices:
                        speaker_voices_list.append(self.speaker_voices[speaker])
                    else:
                        # default per speaker mapping
                        speaker_voices_list.append(self.default_voice)
                
                logger.info(f"✅ Multi-speaker TTS from structured story:")
                logger.info(f"  - Characters: {story_input.characters}")
                logger.info(f"  - Speakers: {speaker_names}")
                logger.info(f"  - Voice models: {speaker_voices_list}")
                logger.info(f"  - Script length: {len(formatted_script)} chars")
            else:
                # Fallback: plain text story (for backwards compatibility)
                formatted_script = f"Narrator: {story_input}"
                speaker_voices_list = [self.default_voice]
                logger.info(f"ℹ️  Single-speaker TTS from plain text (fallback mode)")
                logger.info(f"  - Script length: {len(formatted_script)} chars")
            
            # Calculate word count and log info
            word_count = len(formatted_script.split())
            logger.info(f"Starting streaming TTS for session {session_id}")
            logger.info(f"Story: {len(formatted_script)} chars, {word_count} words")
            logger.info(f"Estimated time: ~{word_count / 150:.1f} minutes")
            
            # Create session directory
            session_audio_dir = self.audio_dir / session_id
            logger.info(f"📁 Creating audio directory: {session_audio_dir}")
            session_audio_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"✅ Directory created/exists")
            
            # Create progressive WAV file (playable from the start!)
            progressive_wav_path = session_audio_dir / "progressive.wav"
            logger.info(f"📝 Will save playable WAV to: {progressive_wav_path}")
            
            # Write WAV header immediately (we'll update sizes as we go)
            # Use a large placeholder size that will be updated at the end
            wav_header = self._create_wav_header(
                sample_rate=24000,
                channels=1,
                bits_per_sample=16,
                data_size=0  # Will update this as we write
            )
            logger.info(f"✓ Created WAV header ({len(wav_header)} bytes)")
            
            payload = {
                "script": formatted_script,
                "speaker_voices": speaker_voices_list,
                "cfg_scale": 1.3,
                "session_id": session_id,
                "speaker_mapping": speaker_mapping if isinstance(story_input, StoryStructure) else None,
                "voice_overrides": speaker_voice_overrides
            }
            
            api_key = api_key_override or self.default_api_key
            if not api_key:
                raise ValueError("Tech42 TTS API key is required for audio generation")

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            logger.info(f"Connecting to Tech42 TTS /generate/stream...")
            logger.info(f"  URL: {self.api_url}/generate/stream")
            logger.info(f"  Payload size: {len(formatted_script)} chars, {word_count} words")
            logger.info(f"  Speakers: {len(speaker_voices_list)}")
            
            # Stream from Tech42 TTS with longer timeout for large stories
            # Timeout: 20 minutes (1200 seconds) for connect/read/write
            timeout_config = httpx.Timeout(
                connect=30.0,      # 30s to establish connection
                read=1200.0,       # 20 min to read response (streaming audio)
                write=30.0,        # 30s to write request
                pool=30.0          # 30s to get connection from pool
            )
            
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                async with client.stream(
                    "POST",
                    f"{self.api_url}/generate/stream",
                    json=payload,
                    headers=headers
                ) as response:
                    logger.info(f"✓ Connection established, status: {response.status_code}")
                    
                    # Check for errors before streaming
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error(f"❌ TTS API error: {response.status_code}")
                        logger.error(f"  Response: {error_text[:500]}")
                        raise Exception(f"TTS API returned {response.status_code}: {error_text[:200]}")
                    
                    response.raise_for_status()
                    logger.info(f"✓ Streaming started (Content-Type: {response.headers.get('content-type')})")
                    
                    chunk_count = 0
                    total_bytes = 0
                    is_first_chunk = True  # Track first chunk to skip Tech42 TTS's WAV header
                    pcm_bytes_saved = 0
                    
                    # Write WAV header first (makes file immediately playable!)
                    with open(progressive_wav_path, 'wb') as audio_file:
                        audio_file.write(wav_header)
                        logger.info(f"✓ Wrote WAV header to {progressive_wav_path.name}")
                        
                        # Start HLS converter IMMEDIATELY (it will wait for stdin data)
                        hls_dir = session_audio_dir / "hls"
                        hls_process = None
                        
                        try:
                            hls_process = self._start_hls_converter(hls_dir)
                            logger.info(f"🎬 HLS converter started (PID: {hls_process.pid}) - waiting for audio data")
                        except Exception as hls_err:
                            logger.warning(f"⚠️  Failed to start HLS converter: {hls_err}")
                            # Continue anyway - progressive WAV will still work
                        
                        # Start real-time S3 uploader (if user_id provided)
                        upload_task = None
                        if user_id:
                            upload_task = asyncio.create_task(
                                self._realtime_s3_uploader(session_id, user_id, hls_dir)
                            )
                            logger.info(f"⚡ Real-time S3 uploader started")
                        
                        # Now append PCM data as it arrives
                        logger.info(f"Starting async iteration over response stream...")
                        try:
                            async for chunk in response.aiter_raw():
                                logger.debug(f"Received chunk: {len(chunk) if chunk else 0} bytes")
                                if chunk:
                                    chunk_count += 1
                                    total_bytes += len(chunk)
                                    
                                    # Skip Tech42 TTS's WAV header from first chunk ONLY
                                    chunk_to_save = chunk
                                    if is_first_chunk:
                                        if len(chunk) >= 44:
                                            # Save only PCM data (skip 44-byte Tech42 TTS header)
                                            chunk_to_save = chunk[44:]
                                            logger.info(f"✓ Skipped Tech42 TTS WAV header from chunk 1: {len(chunk)} bytes -> {len(chunk_to_save)} bytes PCM")
                                        else:
                                            logger.warning(f"⚠️ First chunk too small ({len(chunk)} bytes), skipping")
                                            chunk_to_save = b''
                                        is_first_chunk = False
                                    
                                    # Process PCM data
                                    if chunk_to_save:
                                        # 1. Write to progressive WAV file (for fallback and Range requests)
                                        audio_file.write(chunk_to_save)
                                        audio_file.flush()
                                        pcm_bytes_saved += len(chunk_to_save)
                                        
                                        # 2. Pipe to FFmpeg for HLS conversion (if running)
                                        if hls_process and hls_process.stdin:
                                            try:
                                                hls_process.stdin.write(chunk_to_save)
                                                hls_process.stdin.flush()
                                            except (BrokenPipeError, ValueError) as pipe_err:
                                                logger.warning(f"⚠️  HLS pipe error: {pipe_err}")
                                                # FFmpeg died - close the pipe
                                                if hls_process.stdin:
                                                    hls_process.stdin.close()
                                                hls_process = None
                                    
                                    # Yield chunk to frontend (for status updates)
                                    yield chunk
                                    
                                    # Update WAV header every 50 chunks for accurate duration
                                    if chunk_count % 50 == 0:
                                        self._update_wav_header_sizes(progressive_wav_path, pcm_bytes_saved)
                                        logger.info(f"  Streamed {chunk_count} chunks, {pcm_bytes_saved:,} PCM bytes saved")
                        
                        except httpx.RemoteProtocolError as remote_err:
                            logger.error(f"❌ TTS API connection closed unexpectedly", exc_info=True)
                            logger.error(f"  Chunks received before disconnect: {chunk_count}")
                            logger.error(f"  PCM bytes saved: {pcm_bytes_saved}")
                            logger.error(f"  This usually means:")
                            logger.error(f"    1. TTS API server crashed or restarted")
                            logger.error(f"    2. Load balancer timeout (check ALB settings)")
                            logger.error(f"    3. Story too large for TTS API")
                            raise Exception(f"TTS API disconnected after {chunk_count} chunks: {remote_err}")
                        except Exception as stream_err:
                            logger.error(f"❌ Error during stream reading", exc_info=True)
                            logger.error(f"  Chunks received: {chunk_count}")
                            raise
                    
                    logger.info(f"Finished async iteration")
            
            logger.info(f"✅ Streaming complete: {chunk_count} chunks, {total_bytes:,} bytes ({pcm_bytes_saved:,} PCM bytes saved)")
            
            # Final update of WAV header with correct sizes
            logger.info(f"📝 Finalizing WAV file with {pcm_bytes_saved:,} bytes of PCM data...")
            try:
                self._update_wav_header_sizes(progressive_wav_path, pcm_bytes_saved)
                logger.info(f"✓ Progressive WAV file complete: {progressive_wav_path}")
            except Exception as wav_err:
                logger.error(f"❌ Failed to finalize WAV header: {wav_err}", exc_info=True)
                # Continue anyway - file should still be playable
            
            # Close FFmpeg stdin to signal end of stream
            if hls_process:
                logger.info(f"🎬 Finalizing HLS conversion (closing FFmpeg stdin)...")
                try:
                    # Close stdin to signal end of input
                    if hls_process.stdin:
                        hls_process.stdin.close()
                    
                    # Wait briefly for FFmpeg to finish processing
                    logger.info(f"⏳ Waiting for FFmpeg to finish (timeout: 10s)...")
                    try:
                        # Use wait() with timeout instead of communicate()
                        hls_process.wait(timeout=10)
                        logger.info(f"✓ FFmpeg completed, returncode: {hls_process.returncode}")
                        
                        if hls_process.returncode == 0:
                            logger.info(f"✅ HLS converter finished successfully")
                            # Log segment creation
                            hls_dir = session_audio_dir / "hls"
                            if hls_dir.exists():
                                segment_count = len(list(hls_dir.glob("segment_*.ts")))
                                logger.info(f"  📦 Created {segment_count} HLS segments")
                        else:
                            logger.warning(f"⚠️  HLS converter exited with code {hls_process.returncode}")
                    except subprocess.TimeoutExpired:
                        logger.warning(f"⚠️  FFmpeg still running after 10s, force terminating...")
                        try:
                            hls_process.terminate()
                            hls_process.wait(timeout=3)
                            logger.info(f"  FFmpeg terminated")
                        except subprocess.TimeoutExpired:
                            logger.warning(f"⚠️  Force killing FFmpeg")
                            hls_process.kill()
                            try:
                                hls_process.wait(timeout=1)
                            except:
                                pass
                            logger.info(f"  FFmpeg killed")
                except BrokenPipeError:
                    logger.info(f"  FFmpeg stdin already closed")
                except Exception as hls_close_err:
                    logger.error(f"❌ Error during FFmpeg cleanup: {hls_close_err}", exc_info=True)
                
                logger.info(f"✓ FFmpeg cleanup complete")
            
            # Stop real-time S3 uploader
            if upload_task:
                upload_task.cancel()
                try:
                    await upload_task
                except asyncio.CancelledError:
                    logger.info(f"⚡ Real-time S3 uploader stopped")
                except Exception as upload_err:
                    logger.warning(f"⚠️  S3 uploader error during cancel: {upload_err}")
            
            # Convert WAV to MP3 for efficient storage
            logger.info(f"🔄 Starting MP3 conversion...")
            try:
                final_mp3_path = session_audio_dir / "final.mp3"
                await self._convert_wav_to_mp3(progressive_wav_path, final_mp3_path)
                logger.info(f"✅ MP3 conversion successful: {final_mp3_path}")
                logger.info(f"✅ Kept playable files: {final_mp3_path.name} and {progressive_wav_path.name}")
            except Exception as mp3_error:
                logger.error(f"❌ MP3 conversion failed: {mp3_error}", exc_info=True)
                logger.warning(f"⚠️  Audio will remain as WAV: {progressive_wav_path}")
                # Keep WAV file if MP3 conversion fails - user can still play WAV
                # Don't raise - streaming was successful, only optimization failed
            
            logger.info(f"🎉 ✅ Audio generation complete for session {session_id}")
            try:
                logger.info(f"📊 Summary: {chunk_count} chunks, {pcm_bytes_saved:,} PCM bytes, {pcm_bytes_saved/48000:.1f}s audio")
            except Exception as summary_err:
                logger.info(f"📊 Summary: {chunk_count} chunks, {pcm_bytes_saved:,} PCM bytes")
            
            # Upload audio files to S3 (if user_id provided)
            if user_id:
                await self._upload_audio_to_s3(session_id, user_id, session_audio_dir, hls_dir)
            
        except Exception as e:
            logger.error(f"💥 Fatal error in TTS streaming: {e}", exc_info=True)
            try:
                logger.error(f"   Session: {session_id}")
                logger.error(f"   Chunk count: {chunk_count}")
                logger.error(f"   Bytes saved: {pcm_bytes_saved}")
            except:
                logger.error(f"   (Could not log error details)")
            raise
    
    def _create_wav_header(self, sample_rate: int = 24000, channels: int = 1, 
                          bits_per_sample: int = 16, data_size: int = 0) -> bytearray:
        """
        Create a WAV file header.
        
        Args:
            sample_rate: Sample rate in Hz (default: 24000 for Tech42 TTS)
            channels: Number of audio channels (default: 1 for mono)
            bits_per_sample: Bits per sample (default: 16)
            data_size: Size of PCM data in bytes (0 for placeholder)
        
        Returns:
            44-byte WAV header as bytearray
        """
        byte_rate = sample_rate * channels * bits_per_sample // 8
        block_align = channels * bits_per_sample // 8
        file_size = 36 + data_size
        
        wav_header = bytearray(44)
        
        # RIFF header
        wav_header[0:4] = b'RIFF'
        wav_header[4:8] = file_size.to_bytes(4, 'little')
        wav_header[8:12] = b'WAVE'
        
        # fmt chunk
        wav_header[12:16] = b'fmt '
        wav_header[16:20] = (16).to_bytes(4, 'little')  # fmt chunk size
        wav_header[20:22] = (1).to_bytes(2, 'little')   # PCM format
        wav_header[22:24] = channels.to_bytes(2, 'little')
        wav_header[24:28] = sample_rate.to_bytes(4, 'little')
        wav_header[28:32] = byte_rate.to_bytes(4, 'little')
        wav_header[32:34] = block_align.to_bytes(2, 'little')
        wav_header[34:36] = bits_per_sample.to_bytes(2, 'little')
        
        # data chunk
        wav_header[36:40] = b'data'
        wav_header[40:44] = data_size.to_bytes(4, 'little')
        
        return wav_header
    
    def _update_wav_header_sizes(self, wav_path: Path, data_size: int):
        """
        Update the file size and data size fields in an existing WAV header.
        
        Args:
            wav_path: Path to WAV file
            data_size: Size of PCM data in bytes
        """
        try:
            file_size = 36 + data_size
            
            with open(wav_path, 'r+b') as f:
                # Update RIFF chunk size (bytes 4-7)
                f.seek(4)
                f.write(file_size.to_bytes(4, 'little'))
                
                # Update data chunk size (bytes 40-43)
                f.seek(40)
                f.write(data_size.to_bytes(4, 'little'))
            
            logger.debug(f"✓ Updated WAV header: data_size={data_size:,}, file_size={file_size:,}")
            
        except Exception as e:
            logger.warning(f"Failed to update WAV header sizes: {e}")
    
    def _create_wav_from_pcm(self, pcm_path: Path, wav_path: Path, pcm_size: int, sample_rate: int):
        """
        Create a WAV file with proper header from raw PCM data.
        
        Args:
            pcm_path: Input file with raw PCM data (no header)
            wav_path: Output WAV file path
            pcm_size: Size of PCM data in bytes
            sample_rate: Sample rate (e.g., 24000)
        """
        try:
            # Read raw PCM data
            with open(pcm_path, 'rb') as f:
                pcm_data = f.read()
            
            logger.info(f"Read {len(pcm_data):,} bytes of PCM data")
            
            # Create WAV header (44 bytes)
            channels = 1
            bits_per_sample = 16
            byte_rate = sample_rate * channels * bits_per_sample // 8
            block_align = channels * bits_per_sample // 8
            data_size = pcm_size
            file_size = 36 + data_size
            
            wav_header = bytearray(44)
            
            # RIFF header
            wav_header[0:4] = b'RIFF'
            wav_header[4:8] = file_size.to_bytes(4, 'little')
            wav_header[8:12] = b'WAVE'
            
            # fmt chunk
            wav_header[12:16] = b'fmt '
            wav_header[16:20] = (16).to_bytes(4, 'little')  # fmt chunk size
            wav_header[20:22] = (1).to_bytes(2, 'little')   # PCM format
            wav_header[22:24] = channels.to_bytes(2, 'little')
            wav_header[24:28] = sample_rate.to_bytes(4, 'little')
            wav_header[28:32] = byte_rate.to_bytes(4, 'little')
            wav_header[32:34] = block_align.to_bytes(2, 'little')
            wav_header[34:36] = bits_per_sample.to_bytes(2, 'little')
            
            # data chunk
            wav_header[36:40] = b'data'
            wav_header[40:44] = data_size.to_bytes(4, 'little')
            
            # Write WAV file (header + PCM data)
            with open(wav_path, 'wb') as f:
                f.write(wav_header)
                f.write(pcm_data)
            
            logger.info(f"✓ Created WAV file: {wav_path} ({len(wav_header) + len(pcm_data):,} bytes)")
            
        except Exception as e:
            logger.error(f"Failed to create WAV from PCM: {e}")
            raise
    
    def _start_hls_converter(self, hls_dir: Path) -> subprocess.Popen:
        """
        Start FFmpeg process to convert piped WAV data → HLS segments in real-time.
        
        This process reads PCM audio from stdin and continuously generates HLS segments
        that can be played while generation is still ongoing. This is the industry-standard
        approach for live HLS streaming.
        
        Args:
            hls_dir: Directory to store HLS playlist and segments
            
        Returns:
            FFmpeg subprocess handle (write to stdin to feed audio data)
        """
        hls_dir.mkdir(parents=True, exist_ok=True)
        playlist_path = hls_dir / "stream.m3u8"
        
        # FFmpeg command for HLS streaming from stdin
        # Input format: s16le (16-bit signed little-endian PCM) at 24kHz, mono
        # Key flags:
        # - Read from stdin: -i -
        # - hls_time 2: 2-second segments (good balance of latency vs overhead)
        # - hls_list_size 0: Keep all segments in playlist (for seeking)
        # - hls_flags: append_list (progressively update playlist) + 
        #              independent_segments (each segment can decode independently)
        # - hls_segment_type: mpegts for HLS compatibility
        cmd = [
            "ffmpeg",
            "-f", "s16le",  # Input format: 16-bit signed little-endian PCM
            "-ar", "24000",  # Sample rate: 24kHz
            "-ac", "1",  # Channels: mono
            "-i", "-",  # Read from stdin
            "-codec:a", "libmp3lame",  # Output codec: MP3
            "-b:a", "128k",  # 128kbps MP3 for streaming
            "-f", "hls",
            "-hls_time", "2",  # 2-second segments
            "-hls_list_size", "0",  # Keep all segments (for full seeking)
            "-hls_flags", "append_list+independent_segments",  # Progressive playlist updates
            "-hls_segment_type", "mpegts",  # Use MPEG-TS container
            "-hls_segment_filename", str(hls_dir / "segment_%03d.ts"),
            "-hls_playlist_type", "event",  # Event playlist (will add EXT-X-ENDLIST when complete)
            "-y",  # Overwrite output
            str(playlist_path)
        ]
        
        logger.info(f"🎬 Starting HLS converter (stdin → HLS)")
        logger.info(f"  Playlist: {playlist_path}")
        logger.info(f"  Segments: {hls_dir}/segment_*.ts")
        
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,  # We'll write audio data here
            stdout=subprocess.DEVNULL,  # Discard stdout
            stderr=subprocess.DEVNULL,
        )
        
        logger.info(f"🎬 HLS converter started (PID: {process.pid}) - waiting for audio data")
        return process
    
    async def _convert_wav_to_mp3(self, wav_path: Path, mp3_path: Path):
        """
        Convert WAV to MP3 for efficient storage using async subprocess.
        
        Args:
            wav_path: Input WAV file
            mp3_path: Output MP3 file
            
        Raises:
            Exception: If ffmpeg conversion fails
        """
        if not wav_path.exists():
            raise FileNotFoundError(f"WAV file not found: {wav_path}")
        
        try:
            logger.info(f"Converting WAV to MP3: {wav_path} → {mp3_path}")
            logger.info(f"Input WAV size: {wav_path.stat().st_size:,} bytes")
            
            cmd = [
                "ffmpeg", "-i", str(wav_path),
                "-codec:a", "libmp3lame",
                "-b:a", "192k",
                "-ar", "24000",
                "-y",  # Overwrite output file
                str(mp3_path)
            ]
            
            # Use async subprocess to avoid blocking
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Wait for conversion with timeout
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=60.0  # 60 seconds timeout
                )
                
                if process.returncode != 0:
                    stderr_str = stderr.decode() if stderr else "No error output"
                    raise Exception(f"FFmpeg MP3 conversion failed with code {process.returncode}: {stderr_str[:200]}")
                
                logger.info(f"✓ FFmpeg MP3 conversion completed")
            except asyncio.TimeoutError:
                logger.warning(f"⚠️  MP3 conversion timeout, terminating process...")
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    process.kill()
                raise Exception("MP3 conversion timed out after 60 seconds")
            
            # Verify output file
            if mp3_path.exists():
                mp3_size = mp3_path.stat().st_size
                logger.info(f"✓ MP3 file created: {mp3_path}")
                logger.info(f"  Output MP3 size: {mp3_size:,} bytes")
            else:
                raise Exception("MP3 file not created despite ffmpeg success")
            
        except Exception as e:
            logger.error(f"MP3 conversion error: {e}")
            raise
    
    async def _realtime_s3_uploader(self, story_id: str, user_id: str, hls_dir: Path):
        """
        Real-time S3 uploader: Watch for new HLS segments and upload immediately.
        
        This background task runs during audio generation and uploads:
        - New HLS segments as soon as FFmpeg creates them (~every 2 seconds)
        - Updated HLS playlist every 2 seconds
        
        This enables users to start listening within 5-10 seconds of generation start,
        similar to live streaming platforms (Twitch, YouTube Live).
        
        Args:
            story_id: Story/session identifier
            user_id: User identifier
            hls_dir: Local HLS directory path
        """
        from src.tools import s3_storage
        
        uploaded_segments = set()
        segment_state: Dict[str, Tuple[int, float, float, int]] = {}
        last_playlist_upload = 0
        upload_count = 0
        
        logger.info(f"⚡ Real-time S3 uploader: Starting watch on {hls_dir}")
        
        try:
            while True:
                await asyncio.sleep(0.5)  # Check every 500ms for new segments
                
                if not hls_dir.exists():
                    continue
                
                # Find and upload new segments
                segment_files = sorted(hls_dir.glob("segment_*.ts"))
                for segment_path in segment_files:
                    if segment_path.name not in uploaded_segments:
                        # Skip while the file is still being written (size changing)
                        stat = segment_path.stat()
                        current_size = stat.st_size
                        now = time.time()

                        last_state = segment_state.get(segment_path.name)
                        if last_state:
                            last_size, last_mtime, next_attempt_ts, failure_count = last_state
                        else:
                            last_size, last_mtime, next_attempt_ts, failure_count = (-1, 0.0, now + 0.5, 0)

                        if current_size <= 0:
                            # zero-byte file (should not happen) – wait until data arrives
                            segment_state[segment_path.name] = (current_size, stat.st_mtime, now + 0.5, failure_count)
                            continue

                        # If file still growing (size or mtime changed), reset stability timer
                        if current_size != last_size or stat.st_mtime != last_mtime:
                            segment_state[segment_path.name] = (current_size, stat.st_mtime, now + 0.5, failure_count)
                            continue

                        # Wait until stability timer/backoff expires
                        if now < next_attempt_ts:
                            continue

                        try:
                            s3_key = s3_storage.get_story_prefix(user_id, story_id) + f"audio/hls/{segment_path.name}"
                            with open(segment_path, 'rb') as seg_file:
                                success = s3_storage.upload_fileobj(
                                    seg_file,
                                    s3_key,
                                    content_type='video/mp2t'
                                )
                            if success:
                                uploaded_segments.add(segment_path.name)
                                upload_count += 1
                                segment_state.pop(segment_path.name, None)
                                logger.info(f"  ⚡ Uploaded {segment_path.name} to S3 (real-time #{upload_count})")
                            else:
                                # Upload failure (e.g., permissions) - keep trying with exponential backoff
                                failure_count += 1
                                backoff = min(2 ** min(failure_count, 5), 30)
                                segment_state[segment_path.name] = (current_size, stat.st_mtime, now + backoff, failure_count)
                                logger.warning(
                                    f"  ⚠️  Failed to upload {segment_path.name}, retrying in {backoff:.1f}s"
                                )
                        except Exception as segment_err:
                            failure_count += 1
                            backoff = min(2 ** min(failure_count, 5), 30)
                            segment_state[segment_path.name] = (current_size, stat.st_mtime, now + backoff, failure_count)
                            logger.warning(
                                f"  ⚠️  Failed to upload {segment_path.name}: {segment_err} (retry in {backoff:.1f}s)"
                            )
                
                # Update playlist every 2 seconds once segments available
                playlist_path = hls_dir / "stream.m3u8"
                current_time = time.time()
                if playlist_path.exists() and len(uploaded_segments) > 0 and (current_time - last_playlist_upload) >= 2.0:
                    try:
                        with open(playlist_path, 'r') as f:
                            playlist_content = f.read()
                        if s3_storage.save_hls_playlist(user_id, story_id, playlist_content):
                            last_playlist_upload = current_time
                            segment_count = len(uploaded_segments)
                            logger.info(f"  📝 Updated playlist in S3 ({segment_count} segments available)")
                    except Exception as playlist_err:
                        logger.warning(f"  ⚠️  Failed to update playlist: {playlist_err}")
        
        except asyncio.CancelledError:
            # Upload final state before cancellation
            logger.info(f"⚡ Real-time uploader cancelled, uploading final state...")
            
            # Upload any remaining segments
            if hls_dir.exists():
                segment_files = sorted(hls_dir.glob("segment_*.ts"))
                for segment_path in segment_files:
                    if segment_path.name not in uploaded_segments:
                        try:
                            with open(segment_path, 'rb') as seg_file:
                                success = s3_storage.upload_fileobj(
                                    seg_file,
                                    s3_storage.get_story_prefix(user_id, story_id) + f"audio/hls/{segment_path.name}",
                                    content_type='video/mp2t'
                                )
                            if success:
                                uploaded_segments.add(segment_path.name)
                                upload_count += 1
                            else:
                                logger.warning(f"  ⚠️  Final upload failed for {segment_path.name}")
                        except Exception as e:
                            logger.warning(f"  ⚠️  Failed to upload final segment {segment_path.name}: {e}")
            
            # Upload final playlist
            playlist_path = hls_dir / "stream.m3u8"
            if playlist_path.exists():
                try:
                    with open(playlist_path, 'r') as f:
                        playlist_content = f.read()
                    s3_storage.save_hls_playlist(user_id, story_id, playlist_content)
                    logger.info(f"  📝 Final playlist uploaded to S3")
                except Exception as e:
                    logger.warning(f"  ⚠️  Failed to upload final playlist: {e}")
            
            logger.info(f"⚡ Real-time uploader: Total {upload_count} segments uploaded")
            raise  # Re-raise to complete cancellation
    
    async def _upload_audio_to_s3(self, story_id: str, user_id: str, audio_dir: Path, hls_dir: Path):
        """
        Upload all audio files (WAV, MP3, HLS) to S3 after generation.
        
        Note: With real-time uploading enabled, this mainly handles WAV and MP3 files.
        HLS segments are uploaded in real-time by _realtime_s3_uploader().
        
        Args:
            story_id: Story/session identifier
            user_id: User identifier
            audio_dir: Local audio directory path
            hls_dir: Local HLS directory path
        """
        from src.tools import s3_storage
        
        logger.info(f"📤 Uploading audio files to S3 for story {story_id}...")
        
        try:
            # 1. Upload WAV file
            wav_path = audio_dir / "progressive.wav"
            if wav_path.exists():
                if s3_storage.save_audio_file(user_id, story_id, str(wav_path), "progressive.wav"):
                    logger.info(f"  ✅ Uploaded WAV: {wav_path.name}")
                else:
                    logger.warning(f"  ⚠️  Failed to upload WAV: {wav_path.name}")
            
            # 2. Upload MP3 file
            mp3_path = audio_dir / "final.mp3"
            if mp3_path.exists():
                if s3_storage.save_audio_file(user_id, story_id, str(mp3_path), "final.mp3"):
                    logger.info(f"  ✅ Uploaded MP3: {mp3_path.name}")
                else:
                    logger.warning(f"  ⚠️  Failed to upload MP3: {mp3_path.name}")
            
            # 3. Upload HLS playlist (if not already uploaded by real-time uploader)
            playlist_path = hls_dir / "stream.m3u8"
            if playlist_path.exists():
                with open(playlist_path, 'r') as f:
                    playlist_content = f.read()
                if s3_storage.save_hls_playlist(user_id, story_id, playlist_content):
                    logger.info(f"  ✅ Uploaded HLS playlist: stream.m3u8")
                else:
                    logger.warning(f"  ⚠️  Failed to upload HLS playlist")
            
            # 4. Upload HLS segments (if not already uploaded by real-time uploader)
            # Note: With real-time uploading, most segments are already in S3
            # This is a final check/backup to catch any missed segments
            if hls_dir.exists():
                segment_files = sorted(hls_dir.glob("segment_*.ts"))
                uploaded_count = 0
                verified_count = 0
                for segment_path in segment_files:
                    local_size = segment_path.stat().st_size if segment_path.exists() else 0
                    s3_key = s3_storage.get_story_prefix(user_id, story_id) + f"audio/hls/{segment_path.name}"
                    remote_size = s3_storage.get_object_size(s3_key)
                    if remote_size == local_size and local_size > 0:
                        verified_count += 1
                        continue
                    if local_size == 0:
                        logger.warning(f"  ⚠️  Local segment {segment_path.name} has zero size; skipping upload")
                        continue
                    with open(segment_path, 'rb') as seg_file:
                        success = s3_storage.upload_fileobj(
                            seg_file,
                            s3_key,
                            content_type='video/mp2t'
                        )
                    if success:
                        uploaded_count += 1
                    else:
                        logger.warning(f"  ⚠️  Failed to upload segment during final sync: {segment_path.name}")
                
                if uploaded_count > 0:
                    logger.info(f"  ✅ Synced {uploaded_count} HLS segments to S3 (post-generation)")
                else:
                    logger.info(f"  ℹ️  All HLS segments already present in S3 ({verified_count} verified)")
            
            logger.info(f"✅ Audio upload to S3 complete for story {story_id}")
            
        except Exception as e:
            logger.error(f"❌ Error uploading audio to S3: {e}", exc_info=True)
            # Don't raise - audio generation was successful, upload is optional
    
    def _get_audio_duration(self, audio_file: Path) -> float:
        """
        Get duration of audio file in seconds using ffprobe.
        
        Args:
            audio_file: Path to audio file
        
        Returns:
            Duration in seconds
        """
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                str(audio_file)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            duration = float(data["format"]["duration"])
            return duration
        except Exception as e:
            logger.warning(f"Could not get audio duration: {e}")
            return 0.0
    
    async def fetch_available_voices(self, api_key_override: Optional[str] = None):
        """Fetch list of available voices from Tech42 TTS API."""
        try:
            voices = await self.get_voice_catalog(
                force_refresh=True,
                api_key_override=api_key_override
            )
            return voices
        except Exception as e:
            logger.error(f"Failed to fetch voices: {e}")
            return []


# Global instance
_tts_streamer = None

def get_tts_streamer() -> TTSStreamer:
    """Get or create global TTSStreamer instance."""
    global _tts_streamer
    if _tts_streamer is None:
        _tts_streamer = TTSStreamer()
    return _tts_streamer
