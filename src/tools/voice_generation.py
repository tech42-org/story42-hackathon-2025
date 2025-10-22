"""
Voice Generation Tool for audiobook creation.

Integrates with the containerized text-to-speech service to generate
high-quality audio narration for story scenes.
"""

import httpx
import os
from typing import Dict
from strands import tool, ToolContext


@tool(context=True)
async def generate_voice_audio(
    text: str,
    narrator_voice_id: str,
    scene_id: str,
    tool_context: ToolContext
) -> Dict:
    """
    Generate audio narration for story text using the voice generation container.
    
    This tool calls the external TTS service to convert story text into
    spoken audio with the selected narrator voice.
    
    Args:
        text: The story text to convert to speech
        narrator_voice_id: Technical ID of the narrator voice to use
        scene_id: Identifier of the scene being narrated (for tracking)
    
    Returns:
        Dictionary with audio_url, duration_seconds, and metadata
    
    Raises:
        Returns error status if voice service is unavailable or request fails
    """
    
    service_url = os.getenv("VOICE_GENERATION_CONTAINER_URL", "http://voice-service:8080")
    endpoint = f"{service_url}/api/v1/generate"
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Make request to voice generation service
            response = await client.post(
                endpoint,
                json={
                    "text": text,
                    "voice_id": narrator_voice_id,
                    "metadata": {
                        "scene_id": scene_id,
                        "agent_name": tool_context.agent.name
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    "status": "success",
                    "content": [{
                        "json": {
                            "audio_url": result.get("audio_url"),
                            "duration_seconds": result.get("duration", 0),
                            "scene_id": scene_id,
                            "narrator_voice_id": narrator_voice_id
                        }
                    }]
                }
            else:
                return {
                    "status": "error",
                    "content": [{
                        "text": f"Voice generation failed with status {response.status_code}: {response.text}"
                    }]
                }
                
    except httpx.TimeoutException:
        return {
            "status": "error",
            "content": [{
                "text": "Voice generation timed out. The service may be overloaded. Please try again."
            }]
        }
    except Exception as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Error connecting to voice generation service: {str(e)}"
            }]
        }


@tool
async def get_available_narrators() -> Dict:
    """
    Fetch the list of available narrator voices from the voice generation service.
    
    Returns:
        Dictionary with list of narrator profiles including voice characteristics
    """
    
    service_url = os.getenv("VOICE_GENERATION_CONTAINER_URL", "http://voice-service:8080")
    endpoint = f"{service_url}/api/v1/narrators"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(endpoint)
            
            if response.status_code == 200:
                narrators = response.json()
                return {
                    "status": "success",
                    "content": [{
                        "json": {"narrators": narrators}
                    }]
                }
            else:
                # Fallback to default narrators if service unavailable
                return {
                    "status": "success",
                    "content": [{
                        "json": {
                            "narrators": [
                                {
                                    "narrator_id": "narrator_1",
                                    "name": "James (British Male)",
                                    "voice_id": "en-GB-male-1",
                                    "gender": "male",
                                    "accent": "British",
                                    "tone": "Warm, authoritative"
                                },
                                {
                                    "narrator_id": "narrator_2",
                                    "name": "Sarah (American Female)",
                                    "voice_id": "en-US-female-1",
                                    "gender": "female",
                                    "accent": "American",
                                    "tone": "Clear, engaging"
                                }
                            ],
                            "note": "Using fallback narrator list - voice service unavailable"
                        }
                    }]
                }
                
    except Exception as e:
        # Return fallback narrators on error
        return {
            "status": "success",
            "content": [{
                "json": {
                    "narrators": [
                        {
                            "narrator_id": "narrator_1",
                            "name": "Default Voice",
                            "voice_id": "default",
                            "gender": "neutral",
                            "accent": "neutral",
                            "tone": "neutral"
                        }
                    ],
                    "error": f"Could not fetch narrators: {str(e)}"
                }
            }]
        }

