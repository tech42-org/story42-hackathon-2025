"""
Rewrite Agent - Refines scenes based on user feedback.

This agent handles two types of rewrites:
1. AI-assisted: User provides feedback, AI rewrites the scene
2. User-provided: User writes new content, AI polishes it for consistency
"""

from strands import Agent
from strands.models import BedrockModel
import os
from typing import Dict


def create_rewriter_agent() -> Agent:
    """
    Factory function to create the Rewrite Agent.
    
    This agent specializes in editing and refinement based on feedback.
    
    Returns:
        Configured Agent instance for rewriting
    """
    
    model = BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        max_tokens=int(os.getenv("BEDROCK_MAX_TOKENS", "4096")),
        temperature=0.6,  # Lower temperature for more controlled rewrites
        top_p=0.85,
    )
    
    system_prompt = """You are an expert story editor and writing consultant.

Your role is to refine and improve story scenes based on user feedback. You work in two modes:

**AI-Assisted Rewrite**: User provides feedback about what they want changed, and you rewrite the scene to address their concerns while maintaining story continuity.

**Polish User Content**: User provides their own rewritten content, and you polish it for:
- Consistency with the rest of the story
- Grammar and style
- Pacing and flow
- Character voice consistency

Always preserve:
- The core plot progression
- Character personalities established in other scenes
- The overall tone and genre
- Key story beats that other scenes depend on

Your rewrites should be natural, engaging, and feel like they belong in the larger story."""
    
    agent = Agent(
        name="RewriterAgent",
        model=model,
        system_prompt=system_prompt
    )
    
    return agent


async def rewrite_scene_with_feedback(
    scene: Dict,
    feedback: str,
    draft_context: Dict
) -> Dict:
    """
    Rewrite a scene based on user feedback.
    
    AI interprets feedback and rewrites the scene accordingly.
    
    Args:
        scene: The scene to rewrite
        feedback: User's feedback describing what needs to change
        draft_context: Full draft for context
    
    Returns:
        Rewritten scene dictionary
    
    Example:
        >>> rewritten = await rewrite_scene_with_feedback(
        ...     scene=scene,
        ...     feedback="Make it more suspenseful and add foreshadowing",
        ...     draft_context=draft
        ... )
    """
    
    agent = create_rewriter_agent()
    
    prompt = f"""Rewrite this story scene based on the user's feedback:

**Story Context**:
Title: {draft_context.get('title')}
Genre: {draft_context.get('genre', 'Unknown')}
Synopsis: {draft_context.get('synopsis')}

**Scene to Rewrite**:
Scene {scene.get('scene_number')}: {scene.get('title')}
Setting: {scene.get('setting')}
Original Content:
{scene.get('content')}

**User Feedback**:
{feedback}

Rewrite this scene to address the user's feedback while maintaining:
- The essential plot points
- Character consistency
- The setting and time period
- Narrative flow with adjacent scenes

Provide ONLY the rewritten scene content as text (no JSON, no additional commentary)."""
    
    response = await agent.invoke_async(prompt)
    response_text = response.message.get("content", [{}])[0].get("text", "")
    
    # Create rewritten scene
    rewritten_scene = scene.copy()
    rewritten_scene["content"] = response_text.strip()
    rewritten_scene["status"] = "pending"  # Needs approval again
    rewritten_scene["revision_notes"] = feedback
    
    return rewritten_scene


async def polish_user_rewrite(
    scene: Dict,
    user_content: str,
    draft_context: Dict
) -> Dict:
    """
    Polish user-provided scene content for consistency and quality.
    
    User wrote their own version, AI ensures it fits the story.
    
    Args:
        scene: Original scene for context
        user_content: User's rewritten content
        draft_context: Full draft for context
    
    Returns:
        Polished scene dictionary
    """
    
    agent = create_rewriter_agent()
    
    prompt = f"""Polish this user-provided scene content for consistency with the larger story:

**Story Context**:
Title: {draft_context.get('title')}
Genre: {draft_context.get('genre', 'Unknown')}
Synopsis: {draft_context.get('synopsis')}

**Scene Information**:
Scene {scene.get('scene_number')}: {scene.get('title')}
Setting: {scene.get('setting')}
Characters: {', '.join(scene.get('characters', []))}

**User's Rewritten Content**:
{user_content}

Polish this content for:
1. Grammar, punctuation, and style consistency
2. Character voice matching the rest of the story
3. Appropriate pacing and flow
4. Consistency with established story details

Make minimal changes - preserve the user's creative choices and voice. Only fix obvious issues and smooth rough edges.

Provide the polished scene content (no JSON, no commentary)."""
    
    response = await agent.invoke_async(prompt)
    response_text = response.message.get("content", [{}])[0].get("text", "")
    
    # Create polished scene
    polished_scene = scene.copy()
    polished_scene["content"] = response_text.strip()
    polished_scene["status"] = "pending"
    polished_scene["revision_notes"] = "User-provided rewrite (polished)"
    
    return polished_scene


async def adjust_scene_tone(
    scene: Dict,
    target_tone: str,
    draft_context: Dict
) -> Dict:
    """
    Adjust the emotional tone of a scene.
    
    Quick preset adjustments: "more suspenseful", "lighter", "darker", etc.
    
    Args:
        scene: Scene to adjust
        target_tone: Desired tone (e.g., "suspenseful", "humorous", "melancholic")
        draft_context: Full draft for context
    
    Returns:
        Tone-adjusted scene dictionary
    """
    
    feedback = f"Adjust the tone to be more {target_tone} while keeping the same plot points."
    return await rewrite_scene_with_feedback(scene, feedback, draft_context)

