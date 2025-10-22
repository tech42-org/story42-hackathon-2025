"""
Streaming endpoint for multi-agent story generation pipeline.

This implements the exact flow your senior designed:
- Shows which agent is currently working
- Streams agent activity and status messages
- Progress bar showing completion percentage
- Sequential agent execution with real-time updates

Uses Graph pattern with state monitoring (like senior's Swarm approach).
"""

import asyncio
import json
import logging
import traceback
import uuid
from datetime import datetime, UTC
from typing import AsyncGenerator, Dict, List, Any
import math

from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from strands.multiagent.base import Status
from strands import Agent
from src.agents.story_pipeline import build_story_generation_graph, format_story_input
from src.agents.story_models import StoryStructure
from src.tools.integrated_storage import (
    save_complete_story,
    create_story_session,
    update_story_session_status,
    save_story_image
)
from src.tools.image_generation import generate_story_images
from src.auth.cognito_auth import require_auth

security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ================================================================================
# AGENT STATUS MESSAGES (What frontend displays)
# ================================================================================

AGENT_ACTIVITIES = {
    "system_start": [
        "Starting generation pipeline",
        "Validating input parameters",
        "Initializing agent coordination"
    ],
    "research": [
        "Analyzing topic and historical context",
        "Finding core themes and plot elements",
        "Researching character archetypes",
        "Identifying audience resonance factors"
    ],
    "planning": [
        "Designing story outline",
        "Planning narrative structure",
        "Creating chapter summaries",
        "Ensuring pacing and coherence"
    ],
    "writer": [
        "Writing chapter 1",
        "Developing characters and setting",
        "Creating engaging narrative",
        "Crafting dialogue and descriptions"
    ],
    "editor": [
        "Reviewing chapter for polish",
        "Enhancing descriptions and flow",
        "Ensuring tone consistency",
        "Finalizing chapter content"
    ],
    "voice": [
        "Converting text to speech",
        "Applying voice characteristics",
        "Processing audio for each chapter",
        "Generating speech synthesis"
    ],
    "audio": [
        "Processing final audio output",
        "Balancing audio levels",
        "Applying audio effects",
        "Exporting final audio file"
    ],
    "system_end": [
        "Finalizing generation",
        "Packaging story output",
        "Generation complete"
    ]
}


# ================================================================================
# THEMED STATUS GENERATION
# ================================================================================

def generate_themed_statuses_sync(topic: str, creative_notes: str = "") -> Dict[str, List[str]]:
    """
    Generate story-themed status messages using LLM (synchronous).
    
    This runs during the initialization phase to contextualize status messages
    based on the story topic before the main generation starts.
    
    Args:
        topic: Story topic/title
        creative_notes: Additional creative context
        
    Returns:
        Dictionary mapping agent names to themed status messages
    """
    import os
    from strands import Agent
    from strands.models import BedrockModel
    
    try:
        # Build context for theming
        context = f"Story Topic: {topic}"
        if creative_notes and creative_notes.strip():
            context += f"\nCreative Notes: {creative_notes.strip()}"
        
        # Create a themed status agent
        themed_agent = Agent(
            name="status_themer",
            description="Generates story-themed status messages",
            system_prompt=f"""You are a creative status message generator.

Given a story topic and generic agent status messages, rewrite them to be themed around the story.
Keep messages short (5-8 words), engaging, and relevant to the story topic.

**Story Context:**
{context}

**Generic Status Messages:**
{json.dumps(AGENT_ACTIVITIES, indent=2)}

**Your Task:**
Rewrite each status message to be themed around "{topic}".
Make them exciting and story-specific while keeping the same meaning.

**Output Format (JSON):**
{{
    "system_start": [
        "Themed message 1",
        "Themed message 2",
        "Themed message 3"
    ],
    "research": [
        "Themed message 1",
        "Themed message 2",
        "Themed message 3",
        "Themed message 4"
    ],
    ...
}}

Return ONLY the JSON, no other text.""",
            model=BedrockModel(
                model_id=os.getenv("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0"),
                temperature=0.8  # Creative
            )
        )
        
        # Generate themed statuses (synchronous call)
        result = themed_agent("Generate themed status messages")
        
        # Parse JSON response (handle both string and dict responses)
        import re
        response_text = result.message
        
        # Handle Bedrock response structure: {'role': 'assistant', 'content': [{'text': '...'}]}
        if isinstance(response_text, dict):
            if 'content' in response_text and isinstance(response_text['content'], list):
                # Extract text from Bedrock response structure
                if len(response_text['content']) > 0 and 'text' in response_text['content'][0]:
                    response_text = response_text['content'][0]['text']
                    logger.info(f"✅ Extracted JSON from Bedrock response structure")
            else:
                # Already a valid themed activities dict
                if 'system_start' in response_text:
                    logger.info(f"✅ Generated themed statuses for: {topic}")
                    return response_text
        
        # Parse JSON from string
        if isinstance(response_text, str):
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                themed_statuses = json.loads(json_match.group())
                logger.info(f"✅ Generated themed statuses for: {topic}")
                return themed_statuses
        
        logger.warning("⚠️ Failed to parse themed statuses, using defaults")
        return AGENT_ACTIVITIES
            
    except Exception as e:
        logger.error(f"❌ Error generating themed statuses: {e}")
        return AGENT_ACTIVITIES  # Fallback to defaults


# ================================================================================
# STREAMING STORY GENERATION
# ================================================================================

async def stream_story_generation(
    topic: str,
    user_id: str,
    story_type: str = "fiction",
    length: str = "medium",
    tone_style: str = "engaging and descriptive",
    target_audience: str = "general adult audience",
    creative_notes: str = "",
    auth_token: str = ""
) -> AsyncGenerator[str, None]:
    """
    Stream the complete story generation pipeline with progress updates.
    
    This matches your frontend expectations:
    - Shows current agent (system, research, planning, writer, editor, voice, audio)
    - Displays what each agent is doing
    - Updates progress bar
    - Provides real-time status
    
    Args:
        topic: Story topic/title
        user_id: User's Cognito sub ID
        story_type: Type of story (fiction, educational, etc.)
        length: Target length (short, medium, long)
        tone_style: Desired tone and writing style
        target_audience: Target audience description
        creative_notes: Additional context (characters, settings, themes, etc.)
        auth_token: User's JWT token for authenticating with team's Story42 API
        
    Yields:
        SSE-formatted JSON events for frontend
    """
    
    # Build the graph pipeline
    graph = build_story_generation_graph()
    
    # Format input prompt
    prompt = format_story_input(topic, story_type, length, tone_style, target_audience, creative_notes)
    
    # Send initial start event
    yield _sse({
        "type": "start",
        "message": "Initializing story generation pipeline",
        "timestamp": datetime.now(UTC).isoformat()
    })
    
    # INITIALIZATION PHASE: Generate themed status messages
    # This runs synchronously as part of setup before main generation
    yield _sse({
        "type": "status",
        "message": f"✨ Personalizing experience for: {topic}",
        "timestamp": datetime.now(UTC).isoformat()
    })
    
    themed_activities = generate_themed_statuses_sync(topic, creative_notes)
    logger.info(f"📝 Using themed status messages for: {topic}")
    
    # Send themed activities to frontend
    yield _sse({
        "type": "themed_activities",
        "activities": themed_activities,
        "timestamp": datetime.now(UTC).isoformat()
    })
    
    yield _sse({
        "type": "status",
        "message": "✅ Initialization complete, starting story creation",
        "timestamp": datetime.now(UTC).isoformat()
    })
    
    # Start graph execution in background
    task = asyncio.create_task(graph.invoke_async(prompt))
    
    # Track progress using real-time node execution status
    seen_statuses = {}  # Track last seen status for each node: {node_id: Status}
    activities_sent = {}  # Track activities per node: {node_id: count_sent}
    last_activity_time = {}  # Track when we last sent an activity: {node_id: timestamp}
    total_nodes = len(graph.nodes)
    
    try:
        logger.info(f"Graph execution started for topic: {topic}")
        
        # Monitor graph execution using real-time node status
        while not task.done():
            await asyncio.sleep(0.2)  # Poll every 200ms for responsive updates
            
            current_time = asyncio.get_event_loop().time()
            
            # Check ALL nodes for status changes (this is the key!)
            for node_id, node in graph.nodes.items():
                last_status = seen_statuses.get(node_id, Status.PENDING)
                current_status = node.execution_status
                
                # Detect transition to EXECUTING
                if last_status == Status.PENDING and current_status == Status.EXECUTING:
                    seen_statuses[node_id] = Status.EXECUTING
                    activities_sent[node_id] = 0
                    last_activity_time[node_id] = current_time
                    
                    logger.info(f"Agent EXECUTING: {node_id}")
                    
                    # Send agent start event IMMEDIATELY
                    completed_count = sum(1 for s in seen_statuses.values() if s in [Status.COMPLETED, Status.FAILED])
                    yield _sse({
                        "type": "agent_start",
                        "agent": _format_agent_name(node_id),
                        "agent_id": node_id,
                        "progress": (completed_count / total_nodes) * 100,
                        "nodes_completed": completed_count,
                        "total_nodes": total_nodes,
                        "message": f"{_format_agent_name(node_id)} is now working"
                    })
                
                # Send activities for EXECUTING nodes
                if current_status == Status.EXECUTING:
                    # Get themed activities or fall back to defaults
                    themed = themed_activities.get(node_id)
                    default = AGENT_ACTIVITIES.get(node_id, [])
                    activities = themed if themed else default
                    
                    sent_count = activities_sent.get(node_id, 0)
                    last_time = last_activity_time.get(node_id, 0)
                    
                    # Send next activity if available and enough time passed (1.2s interval)
                    if sent_count < len(activities) and (current_time - last_time) >= 1.2:
                        activity = activities[sent_count]
                        
                        completed_count = sum(1 for s in seen_statuses.values() if s in [Status.COMPLETED, Status.FAILED])
                        yield _sse({
                            "type": "agent_activity",
                            "agent": _format_agent_name(node_id),
                            "agent_id": node_id,
                            "activity": activity,
                            "progress": (completed_count / total_nodes) * 100
                        })
                        
                        activities_sent[node_id] = sent_count + 1
                        last_activity_time[node_id] = current_time
                        logger.info(f"Activity for {node_id}: {activity}")
                
                # Detect transition to COMPLETED/FAILED
                if last_status == Status.EXECUTING and current_status in [Status.COMPLETED, Status.FAILED]:
                    # Flush any remaining activities first
                    activities = themed_activities.get(node_id, AGENT_ACTIVITIES.get(node_id, []))
                    sent_count = activities_sent.get(node_id, 0)
                    
                    while sent_count < len(activities):
                        activity = activities[sent_count]
                        completed_count = sum(1 for s in seen_statuses.values() if s in [Status.COMPLETED, Status.FAILED])
                        yield _sse({
                            "type": "agent_activity",
                            "agent": _format_agent_name(node_id),
                            "agent_id": node_id,
                            "activity": activity,
                            "progress": (completed_count / total_nodes) * 100
                        })
                        sent_count += 1
                        await asyncio.sleep(0.1)
                    
                    seen_statuses[node_id] = current_status
                    logger.info(f"Agent {current_status.value.upper()}: {node_id}")
                    
                    # Send completion event
                    completed_count = sum(1 for s in seen_statuses.values() if s in [Status.COMPLETED, Status.FAILED])
                    yield _sse({
                        "type": "agent_complete",
                        "agent": _format_agent_name(node_id),
                        "agent_id": node_id,
                        "execution_time_ms": node.execution_time,
                        "status": current_status.value,
                        "progress": (completed_count / total_nodes) * 100,
                        "nodes_completed": completed_count,
                        "total_nodes": total_nodes
                    })
        
        # Get final result
        result = await task
        
        # Send completion event
        # Generate session ID for file storage
        session_id = str(uuid.uuid4())
        
        # Use Strands' structured_output() to convert story text to StoryStructure (NO REGEX!)
        # This is the proper Strands way - let LLM convert unstructured text to structured data
        structured_story: StoryStructure = None
        story_text = ""
        
        try:
            # Get the raw story text from editor or writer
            raw_text = ""
            if "editor" in result.results:
                editor_result = result.results["editor"].result
                if hasattr(editor_result, 'message') and hasattr(editor_result.message, 'content'):
                    raw_text = str(editor_result.message.content[0].text) if editor_result.message.content else ""
                elif isinstance(editor_result, str):
                    raw_text = editor_result
                else:
                    raw_text = str(editor_result)
            
            if not raw_text and "writer" in result.results:
                writer_result = result.results["writer"].result
                if hasattr(writer_result, 'message') and hasattr(writer_result.message, 'content'):
                    raw_text = str(writer_result.message.content[0].text) if writer_result.message.content else ""
                elif isinstance(writer_result, str):
                    raw_text = writer_result
                else:
                    raw_text = str(writer_result)
            
            if raw_text:
                logger.info(f"📝 Converting text output ({len(raw_text)} chars) to structured format using Strands...")
                
                # Use Strands' structured_output() to convert text to StoryStructure
                # This is the industry-standard way - no regex, just LLM-powered conversion
                conversion_agent = Agent()
                structured_story = conversion_agent.structured_output(
                    StoryStructure,
                    f"""Convert this story into the required structured format.
                    
Story text:
{raw_text}

Instructions:
- Extract the title
- Identify all chapters with their numbers and titles
- For each chapter, extract all lines of narration and dialogue
- Use speaker="Narrator" for narration
- Use character names for dialogue (e.g., "Rashid", "Mina", "Nima")
- List all unique character names (excluding Narrator)
- IMPORTANT: Limit to maximum 3 characters (for text-to-speech voice support)
- If the story has more than 3 characters, merge minor characters into the narrator or main characters
"""
                )
                
                logger.info(f"✅ Converted to structured story: {len(structured_story.chapters)} chapters, {len(structured_story.characters)} characters")
                
                # Convert structured story to plain text for display
                story_text_parts = []
                story_text_parts.append(f"# {structured_story.title}\n\n")
                
                for chapter in structured_story.chapters:
                    story_text_parts.append(f"\n## Chapter {chapter.chapter_number}: {chapter.title}\n\n")
                    for line in chapter.lines:
                        text = line.text.strip()
                        
                        if line.speaker == "Narrator":
                            # Narrator lines without speaker prefix
                            story_text_parts.append(f"{text}\n\n")
                        else:
                            # Character dialogue: show speaker name before their dialogue
                            # Format: "Speaker Name: dialogue text"
                            # Remove existing quotes if present
                            if text.startswith('"') and text.endswith('"'):
                                text = text[1:-1]  # Remove quotes
                            
                            story_text_parts.append(f"**{line.speaker}:** \"{text}\"\n\n")
                
                story_text = "".join(story_text_parts)
                logger.info(f"✅ Generated display text: {len(story_text)} chars")
            else:
                logger.error("❌ No text found in results")
                story_text = "Story generation completed but no story text was returned."
                    
        except Exception as e:
            logger.error(f"❌ Error converting story: {e}")
            logger.error(traceback.format_exc())
            # Fallback: use raw text if conversion fails
            if raw_text:
                story_text = raw_text
                logger.warning("⚠️  Using raw text as fallback")
            else:
                story_text = "Story generation completed but story extraction failed."
        
        story_data = {
            "story": story_text,  # Keep for backward compatibility
            "story_text": story_text,  # New format for S3 storage
            "title": topic,  # Use topic as title
            "topic": topic,
            "story_type": story_type,
            "length": length,
            "tone_style": tone_style,
            "target_audience": target_audience,
            "agents_used": ["system", "research", "planning", "writer", "editor", "voice", "audio"],
            "generated_at": datetime.now(UTC).isoformat(),
            "execution_time_ms": result.execution_time,
            "status": str(result.status)
        }
        
        # Add structured story if available (for TTS multi-speaker support)
        if structured_story:
            story_data["structured_story"] = structured_story.model_dump()
            logger.info(f"✅ Including structured story in save: {len(structured_story.chapters)} chapters")
        
        # Save to integrated storage (DynamoDB + S3)
        await save_complete_story(session_id, user_id, story_data)
        logger.info(f"✅ Story saved to DynamoDB + S3: {session_id}")
        
        # Generate images for story chapters using Story42 API (NO REGEX - use structured data!)
        image_urls = []
        if structured_story and len(structured_story.chapters) > 0:
            try:
                yield _sse({
                    "type": "agent_activity",
                    "agent_name": "Image Generator",
                    "activity": "Generating illustrations using Story42 API..."
                })
                
                # Use structured chapter data directly (no parsing needed!)
                chapter_texts = structured_story.get_chapter_texts()
                logger.info(f"✅ Using {len(chapter_texts)} chapters directly from structured story")
                
                complete_story_parts = build_complete_story_parts(structured_story)

                logger.info(f"✅ Prepared {len(complete_story_parts)} story parts for image generation payload")
                
                # Log sample structure for debugging
                if complete_story_parts:
                    sample_part = complete_story_parts[0]
                    logger.info(f"📋 Sample story part structure: part={sample_part.get('story_part')}, sections={len(sample_part.get('sections', []))}")
                    if sample_part.get('sections'):
                        sample_section = sample_part['sections'][0]
                        logger.info(f"📋 Sample section structure: section_num={sample_section.get('section_num')}, segments={len(sample_section.get('segments', []))}")
                        if sample_section.get('segments'):
                            sample_segment = sample_section['segments'][0]
                            logger.info(f"📋 Sample segment: num={sample_segment.get('segment_num')}, speaker={sample_segment.get('speaker')}, content_len={len(sample_segment.get('segment_content', ''))}")

                if complete_story_parts:
                    img_result = await generate_story_images(
                        complete_story_parts=complete_story_parts,
                        art_style="whimsical watercolor illustration",
                        job_id=f"story-{session_id}",
                        auth_token=auth_token  # Use logged-in user's token
                    )
                    
                    if img_result.get("status") == "success":
                        generated_segments = img_result.get("story_segments", [])
                        
                        # Story42 API returns presigned URLs directly (no need to save to S3)
                        # Images are already in the team's S3 bucket
                        for segment in generated_segments:
                            presigned_url = segment.get('image_presigned_url')
                            if presigned_url:
                                image_urls.append(presigned_url)
                        
                        logger.info(f"✅ Story42 generated {len(image_urls)} images with presigned URLs")
                        
                        # Update story metadata in S3 with image URLs
                        if image_urls:
                            from src.tools.s3_storage import update_metadata
                            update_metadata(user_id, session_id, {"images": image_urls})
                            logger.info(f"✅ Updated story metadata with {len(image_urls)} image URLs")
                    else:
                        logger.warning("Image generation returned no segments: %s", img_result)
                else:
                    logger.warning(f"Image generation failed: {img_result.get('message')}")
                
            except Exception as img_error:
                logger.warning(f"Image generation failed: {img_error}")
                # Continue even if images fail
        
        # Build complete result with all data
        result_payload = {
            "story": story_text,
            "topic": topic,
            "session_id": session_id,
            "images": image_urls,
            "download_url": f"/api/v1/stories/{session_id}/download"
        }
        
        # Include structured story and speaker list for frontend
        if structured_story:
            result_payload["structured_story"] = structured_story.model_dump()
            result_payload["speakerOptions"] = ["Narrator"] + structured_story.characters
            logger.info(f"✅ Including {len(structured_story.characters)} speakers in response: {structured_story.characters}")
        
        final_event = _sse({
            "type": "complete",
            "status": str(result.status),
            "message": "Story generation complete!",
            "execution_time_ms": result.execution_time,
            "result": result_payload,
            "total_nodes_completed": result.completed_nodes,
            "failed_nodes": result.failed_nodes,
            "progress": 100,
            "timestamp": datetime.now(UTC).isoformat()
        })
        logger.info(f"📤 Sending final 'complete' event to frontend")
        yield final_event
        logger.info(f"✅ Final event sent, stream complete")
    
    except Exception as e:
        error_msg = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error(f"Error in stream_story_generation: {error_msg}")
        logger.error(f"Traceback: {error_traceback}")
        
        yield _sse({
            "type": "error",
            "error": error_msg,
            "error_type": type(e).__name__,
            "timestamp": datetime.now(UTC).isoformat(),
            "details": error_traceback if logger.level == logging.DEBUG else None
        })


# ================================================================================
# HELPER FUNCTIONS
# ================================================================================

def _sse(data: dict) -> str:
    """Format data as Server-Sent Event with proper JSON escaping."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _format_agent_name(agent_id: str) -> str:
    """Format agent ID into display name."""
    name_mapping = {
        "system_start": "System Agent",
        "research": "Research Agent",
        "planning": "Planning Agent",
        "writer": "Writer Agent",
        "editor": "Editor Agent",
        "voice": "Voice Agent",
        "audio": "Audio Agent",
        "system_end": "System Agent (Finalizing)"
    }
    return name_mapping.get(agent_id, agent_id.replace("_", " ").title())


def build_complete_story_parts(structured_story: StoryStructure) -> List[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = []
    chapters = structured_story.chapters
    total = len(chapters)

    def classify(idx: int, title: str) -> str:
        lower_title = title.lower()
        if idx == 1 or "begin" in lower_title:
            return "beginning"
        if idx == total or "end" in lower_title:
            return "end"
        return "middle"

    buckets: Dict[str, List[Chapter]] = {"beginning": [], "middle": [], "end": []}
    for i, chapter in enumerate(chapters, start=1):
        buckets[classify(i, chapter.title or "")].append(chapter)

    non_empty_parts = [
        (name, bucket) for name, bucket in buckets.items() if bucket
    ]

    segment_counter = 1
    parts: List[Dict[str, Any]] = []
    
    # Story42 API maximum: 3 images total (1 per section)
    # We need exactly 3 sections across all story parts (beginning/middle/end)
    MAX_SECTIONS = 3

    # Calculate how to distribute sections across parts
    sections_per_part = MAX_SECTIONS // len(non_empty_parts) if non_empty_parts else 1
    remaining_sections = MAX_SECTIONS
    global_section_num = 1

    for part_idx, (part_name, bucket) in enumerate(non_empty_parts):
        # Flatten all dialogue lines within this bucket
        flat_lines: List[Any] = []
        for chapter in bucket:
            flat_lines.extend(chapter.lines)

        if not flat_lines:
            continue

        # Determine sections for this part (ensure we hit MAX_SECTIONS total)
        is_last_part = (part_idx == len(non_empty_parts) - 1)
        sections_for_this_part = remaining_sections if is_last_part else min(sections_per_part, remaining_sections)
        sections_for_this_part = max(1, sections_for_this_part)  # At least 1 section per part

        # Calculate lines per section to distribute evenly
        lines_per_section = max(1, len(flat_lines) // sections_for_this_part)
        
        sections: List[Dict[str, Any]] = []
        
        for section_idx in range(sections_for_this_part):
            start = section_idx * lines_per_section
            # For last section in part, take all remaining lines
            if section_idx == sections_for_this_part - 1:
                chunk_lines = flat_lines[start:]
            else:
                chunk_lines = flat_lines[start:start + lines_per_section]
            
            if not chunk_lines:
                continue

            # Create segments for this section
            # IMPORTANT: Limit to max 3 segments to prevent cluttered images with too many speech bubbles
            segments: List[Dict[str, Any]] = []
            MAX_SEGMENTS_PER_SECTION = 3
            
            if len(chunk_lines) <= MAX_SEGMENTS_PER_SECTION:
                # Use all lines if we have 3 or fewer
                for line in chunk_lines:
                    segments.append({
                        "segment_num": segment_counter,
                        "segment_content": line.text.strip(),
                        "speaker": line.speaker or "Narrator"
                    })
                    segment_counter += 1
            else:
                # Combine lines into max 3 segments for cleaner images
                step = max(1, len(chunk_lines) // MAX_SEGMENTS_PER_SECTION)
                for i in range(0, len(chunk_lines), step):
                    if len(segments) >= MAX_SEGMENTS_PER_SECTION:
                        break
                    
                    segment_lines = chunk_lines[i:min(i+step, len(chunk_lines))]
                    # Combine consecutive lines
                    combined_text = " ".join(line.text.strip() for line in segment_lines)
                    primary_speaker = segment_lines[0].speaker or "Narrator"
                    
                    segments.append({
                        "segment_num": segment_counter,
                        "segment_content": combined_text[:500],  # Limit length for Gemini
                        "speaker": primary_speaker
                    })
                    segment_counter += 1

            sections.append({
                "section_num": global_section_num,
                "segments": segments
            })
            global_section_num += 1
            remaining_sections -= 1

        parts.append({
            "story_part": part_name,
            "sections": sections
        })

    return parts


# ================================================================================
# FASTAPI ENDPOINT INTEGRATION
# ================================================================================

def register_pipeline_endpoint(app):
    """Register story pipeline streaming endpoint with FastAPI app."""
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel
    import traceback
    import logging
    
    logger = logging.getLogger(__name__)
    
    class StoryGenerationRequest(BaseModel):
        """Story generation request matching frontend inputs."""
        topic: str
        story_type: str = "fiction"  # fiction, educational, etc.
        length: str = "medium"  # short, medium, long
        tone_style: str = "engaging and descriptive"
        target_audience: str = "general adult audience"
        creative_notes: str = ""  # Additional context: characters, settings, plot points, themes, etc.
    
    @app.post("/api/v1/story/generate-pipeline")
    async def generate_story_pipeline(
        request: StoryGenerationRequest,
        user_data: Dict = Depends(require_auth),
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ):
        """
        Generate complete story using multi-agent pipeline with streaming.
        
        This endpoint matches your frontend flow:
        1. Input Tab: Accepts topic, type, length, tone, audience
        2. Generate Tab: Streams agent activity with progress bar
        3. Download Tab: Returns completed story
        
        **Frontend Usage:**
        ```javascript
        const response = await fetch('/api/v1/story/generate-pipeline', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                topic: 'The Last Robot',
                story_type: 'fiction',
                length: 'medium',
                tone_style: 'dramatic and emotional',
                target_audience: 'young adults'
            })
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.substring(6));
                    
                    switch(data.type) {
                        case 'agent_start':
                            showCurrentAgent(data.agent);
                            updateProgress(data.progress);
                            break;
                        case 'agent_activity':
                            showActivity(data.activity);
                            break;
                        case 'complete':
                            showDownloadButton();
                            break;
                    }
                }
            }
        }
        ```
        """
        try:
            logger.info(f"Starting story generation for topic: {request.topic}")
            
            user_id = user_data.get("sub")
            auth_token = credentials.credentials  # Extract JWT token from Bearer header
            logger.info(f"📝 Story generation requested by user: {user_id}")
            
            return StreamingResponse(
                stream_story_generation(
                    topic=request.topic,
                    user_id=user_id,
                    story_type=request.story_type,
                    length=request.length,
                    tone_style=request.tone_style,
                    target_audience=request.target_audience,
                    creative_notes=request.creative_notes,
                    auth_token=auth_token  # Pass user's JWT token for image generation
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                }
            )
        except Exception as e:
            logger.error(f"Error in generate_story_pipeline: {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, 
                detail={
                    "error": str(e),
                    "type": type(e).__name__,
                    "traceback": traceback.format_exc()
                }
            )

