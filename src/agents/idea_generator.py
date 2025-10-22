"""
Idea Generator Agent - Creates story concepts from user prompts.

This specialized agent takes a user's story idea and generates three
distinct, engaging story concepts that the user can choose from.
"""

from strands import Agent
from strands.models import BedrockModel
import os
import uuid
from typing import List, Dict


def create_idea_generator_agent() -> Agent:
    """
    Factory function to create the Idea Generator Agent.
    
    This agent specializes in creative brainstorming and concept development.
    It generates three diverse story concepts based on user input.
    
    Returns:
        Configured Agent instance for idea generation
    """
    
    # Configure the LLM model
    model = BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        max_tokens=int(os.getenv("BEDROCK_MAX_TOKENS", "4096")),
        temperature=0.9,  # Higher temperature for creative idea generation
        top_p=0.95,
    )
    
    # Define the agent's specialized role
    system_prompt = """You are an expert story concept developer and creative writing consultant.

Your role is to take a user's story idea and expand it into three distinct, compelling story concepts. Each concept should:

1. **Be Unique**: The three concepts should explore different angles, genres, or approaches to the user's core idea
2. **Be Detailed**: Include a clear premise, setting, potential characters, and key themes
3. **Be Engaging**: Write in a way that excites readers and makes them want to read more
4. **Be Feasible**: Ensure each concept can be developed into a full story

For each concept, provide:
- **Title**: An engaging, memorable title
- **Premise**: 2-3 sentences summarizing the core story
- **Genre**: The primary genre (e.g., thriller, romance, sci-fi, fantasy, literary fiction)
- **Target Audience**: Who would enjoy this story (e.g., young adult, adult, middle grade)
- **Estimated Length**: Story scope (short story: 1-7k words, novella: 7-40k words, novel: 40k+ words)
- **Key Themes**: 3-5 major themes explored in the story

Format your response as a structured JSON array with three concept objects. Each object should have these exact keys:
{
  "concepts": [
    {
      "title": "Story Title",
      "premise": "Story premise here",
      "genre": "Genre name",
      "target_audience": "Audience description",
      "estimated_length": "Length category",
      "key_themes": ["theme1", "theme2", "theme3"]
    }
  ]
}

Be creative, be bold, and give the user exciting options to choose from!"""
    
    agent = Agent(
        name="IdeaGeneratorAgent",
        model=model,
        system_prompt=system_prompt
    )
    
    return agent


async def generate_story_concepts(user_prompt: str) -> List[Dict]:
    """
    Generate three story concepts from a user's idea.
    
    This is the main entry point for the idea generation phase.
    
    Args:
        user_prompt: The user's story idea or concept
    
    Returns:
        List of three story concept dictionaries
    
    Example:
        >>> concepts = await generate_story_concepts("A detective who can see ghosts")
        >>> print(concepts[0]['title'])
        "Spectral Evidence"
    """
    
    agent = create_idea_generator_agent()
    
    # Create a focused prompt for concept generation
    enhanced_prompt = f"""Based on this user's story idea, generate three distinct and compelling story concepts:

User's Idea: {user_prompt}

Remember to provide three complete concepts in JSON format with all required fields."""
    
    # Invoke the agent
    response = await agent.invoke_async(enhanced_prompt)
    
    # Extract the generated concepts from response
    # The agent should return structured JSON, but we'll parse it carefully
    import json
    import re
    
    # Get text from AgentResult object
    response_text = response.message.get("content", [{}])[0].get("text", "")
    
    # Look for JSON array in the response
    json_match = re.search(r'\{[\s\S]*"concepts"[\s\S]*\}', response_text)
    
    if json_match:
        try:
            data = json.loads(json_match.group(0))
            concepts = data.get("concepts", [])
            
            # Add unique IDs to each concept
            for concept in concepts:
                concept["concept_id"] = str(uuid.uuid4())
            
            return concepts
        except json.JSONDecodeError:
            pass
    
    # Fallback: return basic structure if parsing fails
    return [
        {
            "concept_id": str(uuid.uuid4()),
            "title": "Concept Generation In Progress",
            "premise": "The system is processing your idea. Please try again.",
            "genre": "Unknown",
            "target_audience": "General",
            "estimated_length": "To be determined",
            "key_themes": []
        }
    ]


async def generate_similar_concepts(
    original_concept: Dict,
    user_prompt: str
) -> List[Dict]:
    """
    Generate three new concepts similar to a user-selected concept.
    
    Used when user clicks "Create more like this" button.
    
    Args:
        original_concept: The concept the user liked
        user_prompt: Original user prompt for context
    
    Returns:
        List of three new similar story concepts
    """
    
    agent = create_idea_generator_agent()
    
    # Create a focused prompt for similar concepts
    enhanced_prompt = f"""The user liked this story concept:

Title: {original_concept.get('title')}
Premise: {original_concept.get('premise')}
Genre: {original_concept.get('genre')}
Themes: {', '.join(original_concept.get('key_themes', []))}

Generate three NEW story concepts that are similar in tone, genre, or theme, but with different plots and approaches.

Original user idea for context: {user_prompt}

Provide three complete concepts in JSON format."""
    
    response = await agent.invoke_async(enhanced_prompt)
    
    # Parse response (similar logic to generate_story_concepts)
    import json
    import re
    
    response_text = response.message.get("content", [{}])[0].get("text", "")
    json_match = re.search(r'\{[\s\S]*"concepts"[\s\S]*\}', response_text)
    
    if json_match:
        try:
            data = json.loads(json_match.group(0))
            concepts = data.get("concepts", [])
            for concept in concepts:
                concept["concept_id"] = str(uuid.uuid4())
            return concepts
        except json.JSONDecodeError:
            pass
    
    return []

