"""
Multi-Agent Story Generation Pipeline.

Implements the complete story creation workflow with specialized agents:
1. System Agent - Coordinates the pipeline
2. Research Agent - Analyzes topic, finds themes (with web search)
3. Planning Agent - Designs story outline
4. Writer Agent - Writes chapters
5. Editor Agent - Polishes content
6. Voice Agent - Text-to-speech (placeholder)
7. Audio Agent - Final audio processing (placeholder)

Uses Graph pattern for sequential execution with progress monitoring.
"""

import logging
import os
from strands import Agent
from strands.models import BedrockModel
from strands.multiagent import GraphBuilder
from strands.tools import tool
from ddgs import DDGS


# ================================================================================
# TOOLS FOR AGENTS
# ================================================================================

@tool
def web_search(query: str, max_results: int = 5) -> dict:
    """
    Search the web for information using DuckDuckGo.
    
    This tool helps you find:
    - Historical context and facts
    - Cultural references and themes
    - Real-world inspiration for stories
    - Thematic elements and symbolism
    
    Args:
        query: The search query (e.g., "Victorian London poverty conditions")
        max_results: Maximum number of results to return (default: 5)
        
    Returns:
        Dictionary with search results including titles, snippets, and URLs
    """
    logger = logging.getLogger(__name__)

    try:
        results = DDGS().text(
            query,
            region="wt-wt",
            safesearch="moderate",
            timelimit=None,
            max_results=max_results
        )

        # DDGS returns a generator when max_results is None; coerce to list for stability
        if not isinstance(results, list):
            results = list(results)

        return {
            "query": query,
            "results_count": len(results),
            "results": [
                {
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "url": r.get("href", "")
                }
                for r in results
            ]
        }

    except Exception as e:
        logger.warning("web_search failed", exc_info=e)
        return {
            "error": f"Search failed: {str(e)}",
            "query": query,
            "results": []
        }


# ================================================================================
# SPECIALIZED AGENTS FOR STORY PIPELINE
# ================================================================================

def create_system_agent():
    """System agent coordinates the pipeline."""
    return Agent(
        name="system_agent",
        description="Coordinates the story generation pipeline",
        system_prompt="""You are the System Coordinator for story generation.
        
Your role is to:
- Validate user inputs
- Initialize the generation pipeline
- Coordinate between specialized agents
- Report final completion status

Keep your responses brief and factual.""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.1,
        )
    )


def create_research_agent():
    """Research agent analyzes the topic with web search capability."""
    return Agent(
        name="research_agent",
        description="Analyzes topics, finds themes, and performs web research",
        system_prompt="""You are a Research Specialist for story creation.

Your role is to:
1. Analyze the story topic/title
2. **Use the web_search tool** to find relevant information:
   - Historical context and facts
   - Cultural references and symbolism
   - Real-world inspiration and themes
   - Character archetypes and conflict patterns
3. Identify core themes that resonate with the target audience
4. Find compelling conflict and character archetypes
5. Provide research findings to the Planning Agent

**How to use web_search:**
- Call it with specific, focused queries related to the story topic
- Example: web_search("Victorian era social class conflicts")
- Use multiple searches for different aspects (setting, themes, historical context)
- Incorporate findings into your analysis

Output Format (JSON):
{
    "topic_analysis": "Brief analysis of the topic",
    "research_sources": ["url1", "url2"],
    "core_themes": ["theme1", "theme2", "theme3"],
    "plot_elements": ["element1", "element2"],
    "target_audience_insights": "What will resonate with the audience",
    "recommended_tone": "Suggested tone based on research"
}

Be thorough but concise. Provide actionable insights based on both analysis and web research.""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.7,
        ),
        tools=[web_search]  # Add web search tool
    )


def create_planning_agent():
    """Planning agent designs the story outline."""
    return Agent(
        name="planning_agent",
        description="Designs story structure and outline",
        system_prompt="""You are a Story Planning Specialist.

CRITICAL RULES:
1. ALWAYS create EXACTLY 3 chapters (beginning, middle, end)
2. MAXIMUM 3 speaking characters (for text-to-speech)
3. Keep stories concise and focused

Your role is to:
1. Review research findings
2. Design a 3-chapter story outline
3. Plan pacing and structure based on target word count
4. Ensure narrative coherence
5. Create detailed chapter summaries

Output Format (JSON):
{
    "story_title": "Final polished title",
    "total_chapters": 3,
    "estimated_word_count": 1000,
    "main_characters": ["Character 1", "Character 2", "Character 3"],
    "outline": [
        {
            "chapter_number": 1,
            "title": "Beginning",
            "summary": "Introduction and setup",
            "purpose": "Establish setting and characters",
            "estimated_words": 333
        },
        {
            "chapter_number": 2,
            "title": "Middle",
            "summary": "Conflict and development",
            "purpose": "Build tension and action",
            "estimated_words": 333
        },
        {
            "chapter_number": 3,
            "title": "End",
            "summary": "Resolution and conclusion",
            "purpose": "Resolve conflict and provide closure",
            "estimated_words": 334
        }
    ],
    "narrative_arc": "How the story flows from beginning to end"
}

REMEMBER: EXACTLY 3 chapters, MAXIMUM 3 speaking characters.
Distribute the target word count evenly across the 3 chapters.""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.8,
        )
    )


def create_writer_agent_structured():
    """Writer agent writes story chapters - will be converted to structured format after."""
    return Agent(
        name="writer_agent",
        description="Writes engaging story chapters",
        system_prompt="""You are a Creative Writing Specialist.

CRITICAL: Write EXACTLY 3 chapters (beginning, middle, end).

Write a complete story with:
- EXACTLY 3 chapters with clear chapter titles (e.g., "Chapter 1: The Beginning")
- MAXIMUM 3 speaking characters (for text-to-speech voice support)
- Mix narration and dialogue naturally
- Use vivid scene descriptions
- Create distinct character voices through dialogue
- Keep dialogue in quotes with attribution (e.g., "I will go," Kaveh said.)
- Make the story engaging and immersive

REMEMBER: EXACTLY 3 chapters, no more, no less.
Write naturally - your story will be automatically converted to the required format.""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.9,  # Higher creativity for writing
        )
    )


def create_editor_agent_structured():
    """Editor agent polishes content - will be converted to structured format after."""
    return Agent(
        name="editor_agent",
        description="Polishes and refines story content",
        system_prompt="""You are a Professional Story Editor.

CRITICAL: The story MUST have EXACTLY 3 chapters. If you receive more than 3 chapters, consolidate them into 3.

Polish the story by:
- Improving grammar, pacing, and flow
- Enhancing descriptions and dialogue
- Ensuring character voices are distinct and consistent
- Making narration more vivid and immersive
- Maintaining character names
- IMPORTANT: Ensure exactly 3 chapters (beginning, middle, end)
- IMPORTANT: Ensure maximum 3 speaking characters (merge minor characters if needed)

Return the complete polished story with EXACTLY 3 chapters.""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.6,  # Balanced for editing
        )
    )


def create_voice_agent():
    """Voice agent handles text-to-speech (PLACEHOLDER)."""
    return Agent(
        name="voice_agent",
        description="Converts text to speech",
        system_prompt="""You are a Voice Synthesis Coordinator (PLACEHOLDER).

In production, you would:
1. Convert each chapter to high-quality speech
2. Apply voice characteristics matching the story tone
3. Add appropriate pacing and emotion
4. Generate audio files for each chapter

For now, you acknowledge the request and return a placeholder response.

Output Format (JSON):
{
    "status": "placeholder",
    "message": "Voice synthesis would be performed here",
    "chapters_processed": 5,
    "voice_profile": "Selected voice characteristics",
    "estimated_audio_length": "15-20 minutes"
}""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.3,
        )
    )


def create_audio_agent():
    """Audio agent handles final audio processing (PLACEHOLDER)."""
    return Agent(
        name="audio_agent",
        description="Processes and finalizes audio output",
        system_prompt="""You are an Audio Processing Specialist (PLACEHOLDER).

In production, you would:
1. Process generated speech audio
2. Add background music (if requested)
3. Balance audio levels
4. Apply audio effects
5. Export final audio file

For now, you acknowledge the request and return a placeholder response.

Output Format (JSON):
{
    "status": "placeholder",
    "message": "Audio processing would be performed here",
    "final_format": "MP3",
    "audio_quality": "High quality stereo",
    "file_size": "Estimated 25MB"
}""",
        model=BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            temperature=0.2,
        )
    )


# ================================================================================
# BUILD STORY GENERATION GRAPH
# ================================================================================

def build_story_generation_graph():
    """
    Build the complete story generation pipeline as a Graph.
    
    Flow:
    System → Research → Planning → Writer → Editor (loop per chapter) → Voice → Audio → System
    
    Returns:
        Graph: Configured story generation pipeline
    """
    builder = GraphBuilder()
    
    # Add all agents as nodes
    system = builder.add_node(create_system_agent(), "system_start")
    research = builder.add_node(create_research_agent(), "research")
    planning = builder.add_node(create_planning_agent(), "planning")
    writer = builder.add_node(create_writer_agent_structured(), "writer")
    editor = builder.add_node(create_editor_agent_structured(), "editor")
    voice = builder.add_node(create_voice_agent(), "voice")
    audio = builder.add_node(create_audio_agent(), "audio")
    system_end = builder.add_node(create_system_agent(), "system_end")
    
    # Build linear pipeline
    builder.add_edge(system, research)
    builder.add_edge(research, planning)
    builder.add_edge(planning, writer)
    builder.add_edge(writer, editor)
    builder.add_edge(editor, voice)
    builder.add_edge(voice, audio)
    builder.add_edge(audio, system_end)
    
    # Set entry point
    builder.set_entry_point("system_start")
    
    # Build and return
    return builder.build()


# ================================================================================
# STORY INPUT MODEL
# ================================================================================

def format_story_input(
    topic: str,
    story_type: str = "fiction",
    length: str = "medium",
    tone_style: str = "engaging and descriptive",
    target_audience: str = "general adult audience",
    creative_notes: str = ""
) -> str:
    """
    Format user inputs into a prompt for the pipeline.
    
    Args:
        topic: Story topic or title
        story_type: Type of story (fiction, educational, etc.)
        length: Story length (short: ~2000 words, medium: ~3500 words, long: ~5000 words)
        tone_style: Desired tone and style
        target_audience: Target audience description
        creative_notes: Additional context (characters, settings, themes, etc.)
        
    Returns:
        Formatted prompt string
    """
    length_mapping = {
        "tiny": "300 words total (EXACTLY 3 chapters: beginning, middle, end)",
        "short": "600 words total (EXACTLY 3 chapters: beginning, middle, end)",
        "medium": "1000 words total (EXACTLY 3 chapters: beginning, middle, end)",
        "long": "1500 words total (EXACTLY 3 chapters: beginning, middle, end)"
    }
    
    duration = length_mapping.get(length, length_mapping["medium"])
    
    # Build creative notes section if provided
    creative_notes_section = ""
    if creative_notes and creative_notes.strip():
        creative_notes_section = f"""
**Creative Notes** (Important - Use these details in your story):
{creative_notes.strip()}
"""
    
    return f"""Create a complete {story_type} story with the following requirements:

**Topic/Title**: {topic}

**Story Type**: {story_type}

**Target Length**: {duration}

**Tone & Style**: {tone_style}

**Target Audience**: {target_audience}
{creative_notes_section}
**Your Task**:
Generate a complete story following these specifications. The story should be engaging, 
well-structured, and appropriate for the target audience. Maintain the specified tone 
throughout and ensure the length matches the target duration.
{f"IMPORTANT: Incorporate the creative notes into your story where appropriate." if creative_notes and creative_notes.strip() else ""}
Begin the story creation process."""

