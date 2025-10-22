"""
Story Drafting Agent - Creates structured story scenes from concepts.

This agent takes a selected story concept and develops it into a complete
draft with multiple scenes that users can review and approve.
"""

from strands import Agent
from strands.models import BedrockModel
import os
import uuid
import json
import re
from typing import Dict, List


def create_story_drafting_agent() -> Agent:
    """
    Factory function to create the Story Drafting Agent.
    
    This agent specializes in narrative structure and scene development.
    It breaks stories into manageable scenes with clear narrative flow.
    
    Returns:
        Configured Agent instance for story drafting
    """
    
    model = BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        max_tokens=int(os.getenv("BEDROCK_MAX_TOKENS", "4096")),
        temperature=0.7,  # Balanced for creative but coherent storytelling
        top_p=0.9,
    )
    
    system_prompt = """You are an expert narrative architect and fiction writer.

Your role is to take a story concept and develop it into a complete, structured draft with multiple scenes.

**Scene Structure Guidelines:**

1. **Opening Scene**: Hook the reader, establish setting and protagonist
2. **Rising Action Scenes**: Build tension, develop characters, introduce conflicts
3. **Climax Scene**: Peak of dramatic tension and conflict resolution
4. **Resolution Scene**: Tie up loose ends, show character growth

Each scene should:
- Be 300-800 words (self-contained but part of the larger narrative)
- Have a clear purpose in advancing the plot
- Include vivid sensory details and strong characterization
- End with a hook or transition to the next scene
- Specify setting (where and when)
- List main characters appearing

**Output Format:**

Provide the complete draft as a JSON object with this structure:
{
  "title": "Story Title",
  "synopsis": "2-3 paragraph summary of the complete story",
  "scenes": [
    {
      "scene_number": 1,
      "title": "Scene Title",
      "content": "Full scene text...",
      "setting": "Description of where/when",
      "characters": ["Character1", "Character2"]
    }
  ]
}

Write engaging, polished prose that brings the story to life!"""
    
    agent = Agent(
        name="StoryDraftingAgent",
        model=model,
        system_prompt=system_prompt
    )
    
    return agent


async def create_story_draft(concept: Dict) -> Dict:
    """
    Create a complete story draft from a selected concept.
    
    Generates structured scenes with narrative flow.
    
    Args:
        concept: The story concept dict with title, premise, genre, etc.
    
    Returns:
        Complete draft dictionary with scenes
    
    Example:
        >>> draft = await create_story_draft(concept)
        >>> print(len(draft['scenes']))
        5
    """
    
    agent = create_story_drafting_agent()
    
    # Create detailed prompt for draft generation
    prompt = f"""Develop this story concept into a complete draft with 4-6 scenes:

**Title**: {concept.get('title')}
**Premise**: {concept.get('premise')}
**Genre**: {concept.get('genre')}
**Target Audience**: {concept.get('target_audience')}
**Key Themes**: {', '.join(concept.get('key_themes', []))}

Create a well-structured story draft with:
- A compelling opening that hooks readers
- 2-4 scenes developing the conflict and characters
- A satisfying climax
- A resolution that ties everything together

Provide the complete draft in JSON format with title, synopsis, and scenes array."""
    
    response = await agent.invoke_async(prompt)
    
    # Parse the response
    response_text = response.message.get("content", [{}])[0].get("text", "")
    
    # Extract JSON
    json_match = re.search(r'\{[\s\S]*"scenes"[\s\S]*\}', response_text)
    
    if json_match:
        try:
            draft_data = json.loads(json_match.group(0))
            
            # Add unique IDs and status to each scene
            draft_id = str(uuid.uuid4())
            for i, scene in enumerate(draft_data.get("scenes", [])):
                scene["scene_id"] = str(uuid.uuid4())
                scene["scene_number"] = i + 1
                scene["status"] = "pending"
                scene["revision_notes"] = None
            
            # Create complete draft structure
            draft = {
                "draft_id": draft_id,
                "concept_id": concept.get("concept_id"),
                "title": draft_data.get("title", concept.get("title")),
                "synopsis": draft_data.get("synopsis", ""),
                "scenes": draft_data.get("scenes", [])
            }
            
            return draft
            
        except json.JSONDecodeError as e:
            # Return error structure
            return {
                "draft_id": str(uuid.uuid4()),
                "concept_id": concept.get("concept_id"),
                "title": concept.get("title"),
                "synopsis": "Error generating draft. Please try again.",
                "scenes": [],
                "error": str(e)
            }
    
    # Fallback structure
    return {
        "draft_id": str(uuid.uuid4()),
        "concept_id": concept.get("concept_id"),
        "title": concept.get("title"),
        "synopsis": "Draft generation in progress...",
        "scenes": []
    }


async def expand_scene(
    scene: Dict,
    draft_context: Dict
) -> Dict:
    """
    Expand a scene with more detail.
    
    Used when user wants a particular scene to be longer or more detailed.
    
    Args:
        scene: The scene to expand
        draft_context: Full draft for context
    
    Returns:
        Expanded scene dictionary
    """
    
    agent = create_story_drafting_agent()
    
    prompt = f"""Expand this story scene with more detail, dialogue, and sensory description:

**Story Context**:
Title: {draft_context.get('title')}
Synopsis: {draft_context.get('synopsis')}

**Current Scene**:
Scene {scene.get('scene_number')}: {scene.get('title')}
Setting: {scene.get('setting')}
Current Content: {scene.get('content')}

Expand this scene to 800-1200 words while maintaining the core narrative. Add:
- More vivid sensory details
- Additional dialogue if appropriate
- Deeper character emotions and internal thoughts
- Smoother pacing

Provide ONLY the expanded scene content as text (no JSON, no formatting)."""
    
    response = await agent.invoke_async(prompt)
    response_text = response.message.get("content", [{}])[0].get("text", "")
    
    # Update scene with expanded content
    expanded_scene = scene.copy()
    expanded_scene["content"] = response_text.strip()
    
    return expanded_scene

