"""
Image Generation Tool for visual storybooks.

Uses team's Gemini-powered API to create high-quality illustrations.
Based on Story42 API endpoint with Cognito authentication.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, UTC
from typing import Dict, List

import boto3
import httpx
from strands import tool

logger = logging.getLogger(__name__)

# Team's API configuration
API_BASE_URL = os.getenv("STORY42_API_BASE_URL", "https://a3aflxx1o2.execute-api.us-east-1.amazonaws.com/dev")


@tool
async def generate_story_images(
    complete_story_parts: List[Dict],
    art_style: str = "whimsical watercolor illustration",
    job_id: str = "",
    auth_token: str = ""
) -> Dict:
    """
    Generate story illustrations using team's Gemini-powered image generation API.
    
    This uses the Story42 /generate-story-image endpoint which produces higher quality
    images than Bedrock's Stability model. The API is powered by Google Gemini.
    
    Args:
        complete_story_parts: Story structure with parts, sections, and segments
        auth_token: User's JWT token from frontend (REQUIRED for authentication)
        art_style: Visual style for the illustrations (default: whimsical watercolor)
        job_id: Unique identifier for this image generation job
        
    Returns:
        Dict with status, story_segments (with image URLs), and metadata
        
    Raises:
        Returns error dict if auth_token is not provided
    """
    try:
        if not job_id:
            job_id = f"story-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

        # Count total sections (each section = 1 image)
        total_sections = sum(
            len(part.get("sections", []))
            for part in complete_story_parts
        )
        
        total_segments = sum(
            len(section.get("segments", []))
            for part in complete_story_parts
            for section in part.get("sections", [])
        )
        
        # Story42 API: number_of_panels = number of sections (max 3)
        # Each section generates 1 image, regardless of how many segments it contains
        number_of_panels = total_sections
        
        logger.info(
            "🎨 Generating images via Story42 Gemini API: job=%s, parts=%d, sections=%d, segments=%d, panels=%d",
            job_id,
            len(complete_story_parts),
            total_sections,
            total_segments,
            number_of_panels
        )

        # Validate authentication token
        if not auth_token:
            logger.error("❌ No authentication token provided for Story42 API")
            return {
                "status": "error",
                "message": "Authentication token required for image generation"
            }
        
        logger.info("✅ Using user's authentication token for Story42 API")
        token = auth_token

        # Prepare payload matching team's API format
        payload = {
            "complete_story_parts": complete_story_parts,
            "art_style": art_style,
            "number_of_panels": number_of_panels,
            "job_id": job_id
        }

        # Call team's image generation endpoint
        headers = {
            "Authorization": token,
            "Content-Type": "application/json"
        }

        max_attempts = 5
        response = None
        last_exception: Exception | None = None
        last_error_text = ""

        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:  # 5 min timeout for image generation
                    logger.info(
                        "📤 Calling Story42 image generation API (attempt %d/%d): %s/generate-story-image",
                        attempt,
                        max_attempts,
                        API_BASE_URL,
                    )
                    response = await client.post(
                        f"{API_BASE_URL}/generate-story-image",
                        headers=headers,
                        json=payload,
                    )

                if response.status_code == 200:
                    break

                last_exception = None
                last_error_text = response.text
                logger.error(
                    "❌ Story42 API error (attempt %d/%d): %d - %s",
                    attempt,
                    max_attempts,
                    response.status_code,
                    last_error_text,
                )

            except (httpx.TimeoutException, httpx.HTTPError) as exc:
                last_exception = exc
                last_error_text = str(exc)
                logger.warning(
                    "⚠️ Story42 API request failed (attempt %d/%d): %s",
                    attempt,
                    max_attempts,
                    exc,
                )

            if attempt < max_attempts:
                delay_seconds = min(2 ** (attempt - 1), 16)
                logger.info(
                    "⏳ Retrying Story42 image generation in %s seconds (attempt %d/%d)",
                    delay_seconds,
                    attempt + 1,
                    max_attempts,
                )
                await asyncio.sleep(delay_seconds)

        if not response or response.status_code != 200:
            if isinstance(last_exception, httpx.TimeoutException):
                raise last_exception

            message = last_error_text or "Image generation failed after retries"
            logger.error("❌ Exhausted Story42 retries: %s", message)
            return {
                "status": "error",
                "message": f"Image API error after retries: {message}"
            }

        result = response.json()
        logger.info("✅ Story42 API response status: %d", response.status_code)

        # Extract generated images from response
        if "result" not in result or "story_segments" not in result["result"]:
            logger.error("❌ Unexpected response format from Story42 API: %s", result.keys())
            return {
                "status": "error",
                "message": "Image generation returned unexpected format"
            }

        story_segments = result["result"]["story_segments"]
        
        if not story_segments:
            logger.warning("⚠️ Story42 returned no story_segments")
            return {
                "status": "error",
                "message": "Image generation returned no results"
            }

        logger.info("🖼️ Story42 generated %d images successfully", len(story_segments))
        
        # Log sample image data for debugging
        if story_segments:
            sample = story_segments[0]
            logger.info("📋 Sample segment: number=%s, has_s3_uri=%s, has_presigned_url=%s",
                       sample.get("story_segment_number"),
                       "image_s3_uri" in sample,
                       "image_presigned_url" in sample)

        return {
            "status": "success",
            "story_segments": story_segments,
            "metadata": {
                "job_id": job_id,
                "total_images": len(story_segments),
                "art_style": art_style,
                "generated_at": datetime.now(UTC).isoformat(),
                "provider": "Story42-Gemini"
            }
        }

    except httpx.TimeoutException as e:
        logger.error("❌ Story42 API timeout: %s", e)
        return {
            "status": "error",
            "message": f"Image generation timed out: {str(e)}"
        }
    except Exception as e:
        logger.error("❌ Image generation failed: %s", e)
        return {
            "status": "error",
            "message": f"Image generation failed: {str(e)}"
        }



