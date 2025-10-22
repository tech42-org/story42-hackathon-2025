import json
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional
from decimal import Decimal
import boto3
from litellm import completion
from pydantic import BaseModel

# Configure logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME')
table = dynamodb.Table(DYNAMODB_TABLE_NAME) if DYNAMODB_TABLE_NAME else None

# Helper function to convert Decimal to float for JSON serialization
def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def write_to_dynamodb(user_id: str, session_id: str, route: str, request_data: dict, response_data: dict) -> None:
    """
    Write request/response data to DynamoDB for tracking and analytics.
    This function will not raise exceptions to avoid breaking the main Lambda flow.
    
    Args:
        user_id: User ID from Cognito
        session_id: Session ID (typically job_id)
        route: The route/endpoint that was called
        request_data: The request payload
        response_data: The response payload
    """
    if not table:
        logger.warning("DynamoDB table not configured, skipping write")
        return
    
    try:
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)  # Milliseconds
        created_at = datetime.now(timezone.utc).isoformat()
        
        # Serialize request and response as JSON strings to avoid DynamoDB type descriptors
        # This makes the data more readable and easier to query
        item = {
            'user_id': user_id,
            'session_id': session_id,
            'timestamp': timestamp,
            'route': route,
            'request': json.dumps(request_data, default=decimal_default),
            'response': json.dumps(response_data, default=decimal_default),
            'created_at': created_at
        }
        
        logger.info(f"Writing to DynamoDB - user_id: {user_id}, session_id: {session_id}, route: {route}")
        table.put_item(Item=item)
        logger.info("Successfully wrote to DynamoDB")
        
    except Exception as e:
        # Log the error but don't raise it to avoid breaking the main Lambda flow
        logger.error(f"Failed to write to DynamoDB: {str(e)}")

# Pydantic models for structured responses
class StorySegment(BaseModel):
    segment_num: int
    segment_content: str
    speaker: str

class StorySection(BaseModel):
    section_num: int
    segments: List[StorySegment]

class StoryPartDetail(BaseModel):
    story_part: str  # "beginning", "middle", or "end"
    sections: List[StorySection]

class CompleteStoryResult(BaseModel):
    story_parts: List[StoryPartDetail]
    speaker_names: List[str]
    metadata: dict

class RegenerateSegmentResult(BaseModel):
    new_story_segment: StorySegment
    metadata: dict

class StoryPart(BaseModel):
    story_part: str
    story_part_summary: str
    story_part_speakers: List[str]

class StoryOutlineResult(BaseModel):
    story_parts: List[StoryPart]
    speaker_names: List[str]
    metadata: dict

class TopicIdeasResult(BaseModel):
    subject_category: str
    scope_coverage: str
    structure: str
    source_types: str
    target_audience: str
    tone: str
    metadata: dict

def clean_unicode_characters(text: str) -> str:
    """
    Clean Unicode escape sequences and special characters from text.
    Replaces common Unicode punctuation marks with their ASCII equivalents or spaces.
    
    Args:
        text: The text to clean
    
    Returns:
        Cleaned text with Unicode characters replaced
    """
    # Dictionary of Unicode characters to replace
    replacements = {
        '\u2019': "'",      # Right single quotation mark
        '\u2018': "'",      # Left single quotation mark
        '\u201c': '"',      # Left double quotation mark
        '\u201d': '"',      # Right double quotation mark
        '\u2011': '-',      # Non-breaking hyphen
        '\u2013': '-',      # En dash
        '\u2014': '-',      # Em dash
        '\u2026': '...',    # Horizontal ellipsis
        '\u00a0': ' ',      # Non-breaking space
        '\u2022': '*',      # Bullet point
        '\u2032': "'",      # Prime (feet/minutes)
        '\u2033': '"',      # Double prime (inches/seconds)
    }
    
    cleaned_text = text
    for unicode_char, replacement in replacements.items():
        cleaned_text = cleaned_text.replace(unicode_char, replacement)
    
    return cleaned_text

def extract_quoted_text(text: str) -> str:
    """
    Extract text within quotation marks from a string.
    Handles both straight quotes (") and curly quotes (" ").
    Only looks for double quotes to avoid matching apostrophes.
    If no quoted text is found, returns the original text.
    
    Args:
        text: The text to extract quotes from
    
    Returns:
        Extracted quoted text, or original text if no quotes found
    """
    import re
    
    # Pattern to match text within various types of double quotation marks only
    # We exclude single quotes to avoid matching apostrophes like "I'm" or "Let's"
    patterns = [
        r'"([^"]+)"',      # Straight double quotes - use + instead of * to require at least 1 char
        r'"([^"]+)"',      # Curly double quotes (left and right)
        r'[""]([^""]+)[""]',  # Mixed curly quotes
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        if matches:
            # Return the longest quoted text found (in case of nested quotes)
            longest_match = max(matches, key=len)
            return longest_match.strip()
    
    # If no quoted text found, return original text
    return text

def generate_entire_story(genre: str, reading_level: str, tone: str, story_outline_description: List[dict],
                         story_type: str, number_of_speakers: int, user_id: str, job_id: str,
                         panels: Optional[int] = None, audio_length: Optional[int] = None,
                         model_id: str = "bedrock/us.amazon.nova-pro-v1:0") -> dict:
    """
    Generate a complete detailed story based on the story outline
    
    Args:
        genre: Story genre
        reading_level: Target reading level
        tone: Story tone
        story_outline_description: List of story_parts from generate_story_outline_description
        story_type: "audio" or "visual"
        number_of_speakers: Number of speakers (1-4)
        user_id: Cognito user ID
        job_id: Unique identifier for this story generation job
        panels: Number of panels (required if story_type="visual")
        audio_length: Audio length in minutes (required if story_type="audio")
        model_id: LLM model identifier (default: "bedrock/us.amazon.nova-pro-v1:0")
    
    Returns:
        For audio: 3 story parts, each with multiple sections, each section with multiple segments
        For visual: 3 story parts, number of sections = panels, each section with multiple segments
    """
    try:
        # Validate story_type specific requirements
        if story_type == "visual" and panels is None:
            raise ValueError("panels is required when story_type is 'visual'")
        if story_type == "audio" and audio_length is None:
            raise ValueError("audio_length is required when story_type is 'audio'")
        
        # Validate number_of_speakers
        if not 1 <= number_of_speakers <= 4:
            raise ValueError("number_of_speakers must be between 1 and 4")
        
        # Extract speaker names from outline
        speaker_names = []
        for part in story_outline_description:
            for speaker in part.get('story_part_speakers', []):
                if speaker not in speaker_names:
                    speaker_names.append(speaker)
        
        if story_type == "audio":
            system_prompt = f"""You are a creative storyteller. Generate a complete, detailed story based on the provided outline.

Genre: {genre}
Reading Level: {reading_level}
Tone: {tone}
Story Type: Audio (approximately {audio_length} minutes)
Speakers: {', '.join(speaker_names)}

Based on the outline provided, create a fully detailed story with:
- Exactly 3 story_parts: "beginning", "middle", and "end"
- Each story_part should have multiple sections (2-4 sections depending on the part's importance)
- Each section has: section_num (sequential number starting from 1 across the entire story), and segments (list of dialogue/narration)
- Each segment has: segment_num (sequential number starting from 1 across the entire story), segment_content (the actual text), and speaker (who is speaking)

IMPORTANT: 
- Number all sections sequentially starting from 1 across the entire story (not per part).
- Number all segments sequentially starting from 1 across the entire story (not per section or part).
- Always include the Narrator as a speaker in each section.
- Do not mention the Narrator in the segment content.

Distribute the content appropriately across the 3 parts to tell a complete, engaging story.
Make sure each speaker has an appropriate voice and the story flows naturally.
Keep it age-appropriate for {reading_level} reading level with a {tone} tone.

EXAMPLE OUTPUT FORMAT:
{{
  "story_parts": [
    {{
      "story_part": "beginning",
      "sections": [
        {{
          "section_num": 1,
          "segments": [
            {{"segment_num": 1, "segment_content": "In a sunny meadow, Max the Mouse peeks out of his cozy burrow, eyes wide with curiosity.", "speaker": "Narrator"}},
            {{"segment_num": 2, "segment_content": "Wow! What's that shiny thing over there?", "speaker": "Max the Mouse"}}
          ]
        }},
        {{
          "section_num": 2,
          "segments": [
            {{"segment_num": 3, "segment_content": "A sparkling golden cheese glows softly, promising magic and wishes.", "speaker": "Narrator"}},
            {{"segment_num": 4, "segment_content": "Hello, golden cheese! I'm ready for an adventure!", "speaker": "Max the Mouse"}}
          ]
        }}
      ]
    }},
    {{
      "story_part": "middle",
      "sections": [
        {{
          "section_num": 3,
          "segments": [
            {{"segment_num": 5, "segment_content": "I wish for a big, juicy berry for my friends!", "speaker": "Max the Mouse"}},
            {{"segment_num": 6, "segment_content": "The cheese twinkles, and a basket brimming with berries appears at Max's paws.", "speaker": "Narrator"}}
          ]
        }},
        {{
          "section_num": 4,
          "segments": [
            {{"segment_num": 7, "segment_content": "I'm Cheesy! I can grant three wishes. Let's think of fun ideas together!", "speaker": "Cheesy the Cheese"}},
            {{"segment_num": 8, "segment_content": "Great! Let's make the forest even happier!", "speaker": "Max the Mouse"}}
          ]
        }}
      ]
    }},
    {{
      "story_part": "end",
      "sections": [
        {{
          "section_num": 5,
          "segments": [
            {{"segment_num": 9, "segment_content": "I wish for a tiny bridge over the bubbling brook so everyone can visit my burrow!", "speaker": "Max the Mouse"}},
            {{"segment_num": 10, "segment_content": "A colorful bridge arches across the water, and forest critters cheer as they cross.", "speaker": "Narrator"}}
          ]
        }},
        {{
          "section_num": 6,
          "segments": [
            {{"segment_num": 11, "segment_content": "Thank you, Cheesy! This is the best adventure ever!", "speaker": "Max the Mouse"}},
            {{"segment_num": 12, "segment_content": "The greatest wish is friendship, Max. We'll have many more!", "speaker": "Cheesy the Cheese"}},
            {{"segment_num": 13, "segment_content": "And so Max and Cheesy wave goodbye, their hearts full of joy and ready for the next lighthearted quest.", "speaker": "Narrator"}}
          ]
        }}
      ]
    }}
  ],
  "speaker_names": ["Narrator", "Max the Mouse", "Cheesy the Cheese"],
  "metadata": {{}}
}}"""

            user_prompt = f"""Story Outline:
{json.dumps(story_outline_description, indent=2)}

Create a complete detailed story with dialogue and narration. Break it down into:
- 3 parts (beginning, middle, end)
- Multiple sections per part
- Multiple segments per section (with speaker attribution)

Target length: approximately {audio_length} minutes when narrated."""

        else:  # visual
            sections_per_part = panels // 3
            remainder = panels % 3
            
            system_prompt = f"""You are a creative storyteller. Generate a complete, detailed story based on the provided outline for a visual medium.

Genre: {genre}
Reading Level: {reading_level}
Tone: {tone}
Story Type: Visual
Total Panels: {panels}
Speakers: {', '.join(speaker_names)}

Based on the outline provided, create a fully detailed story with:
- Exactly 3 story_parts: "beginning", "middle", and "end"
- EXACTLY {panels} sections total across all parts (each section represents one panel)
- Each section has: section_num (sequential number starting from 1 across the entire story), and segments (list of what happens/is said in that panel)
- Each segment has: segment_num (sequential number starting from 1 across the entire story), segment_content (the text/dialogue), and speaker (who is speaking)

IMPORTANT: 
- Number all sections sequentially starting from 1 across the entire story (not per part).
- Number all segments sequentially starting from 1 across the entire story (not per section or part).
- Always include the Narrator as a speaker in each section.
- Do not mention the Narrator in the segment content.

Distribution of panels:
- Beginning: approximately {sections_per_part + (1 if remainder > 0 else 0)} panels
- Middle: approximately {sections_per_part + (1 if remainder > 1 else 0)} panels
- End: approximately {sections_per_part} panels

Make sure the story is visually engaging and works well across {panels} panels. 
Keep it age-appropriate for {reading_level} reading level with a {tone} tone.

EXAMPLE OUTPUT FORMAT:
{{
  "story_parts": [
    {{
      "story_part": "beginning",
      "sections": [
        {{
          "section_num": 1,
          "segments": [
            {{"segment_num": 1, "segment_content": "In a sunny meadow, Max the Mouse peeks out of his cozy burrow, eyes wide with curiosity.", "speaker": "Narrator"}},
            {{"segment_num": 2, "segment_content": "Wow! What's that shiny thing over there?", "speaker": "Max the Mouse"}}
          ]
        }},
        {{
          "section_num": 2,
          "segments": [
            {{"segment_num": 3, "segment_content": "A sparkling golden cheese glows softly, promising magic and wishes.", "speaker": "Narrator"}},
            {{"segment_num": 4, "segment_content": "Hello, golden cheese! I'm ready for an adventure!", "speaker": "Max the Mouse"}}
          ]
        }}
      ]
    }},
    {{
      "story_part": "middle",
      "sections": [
        {{
          "section_num": 3,
          "segments": [
            {{"segment_num": 5, "segment_content": "I wish for a big, juicy berry for my friends!", "speaker": "Max the Mouse"}},
            {{"segment_num": 6, "segment_content": "The cheese twinkles, and a basket brimming with berries appears at Max's paws.", "speaker": "Narrator"}}
          ]
        }},
        {{
          "section_num": 4,
          "segments": [
            {{"segment_num": 7, "segment_content": "I'm Cheesy! I can grant three wishes. Let's think of fun ideas together!", "speaker": "Cheesy the Cheese"}},
            {{"segment_num": 8, "segment_content": "Great! Let's make the forest even happier!", "speaker": "Max the Mouse"}}
          ]
        }}
      ]
    }},
    {{
      "story_part": "end",
      "sections": [
        {{
          "section_num": 5,
          "segments": [
            {{"segment_num": 9, "segment_content": "I wish for a tiny bridge over the bubbling brook so everyone can visit my burrow!", "speaker": "Max the Mouse"}},
            {{"segment_num": 10, "segment_content": "A colorful bridge arches across the water, and forest critters cheer as they cross.", "speaker": "Narrator"}}
          ]
        }},
        {{
          "section_num": 6,
          "segments": [
            {{"segment_num": 11, "segment_content": "Thank you, Cheesy! This is the best adventure ever!", "speaker": "Max the Mouse"}},
            {{"segment_num": 12, "segment_content": "The greatest wish is friendship, Max. We'll have many more!", "speaker": "Cheesy the Cheese"}},
            {{"segment_num": 13, "segment_content": "And so Max and Cheesy wave goodbye, their hearts full of joy and ready for the next lighthearted quest.", "speaker": "Narrator"}}
          ]
        }}
      ]
    }}
  ],
  "speaker_names": ["Narrator", "Max the Mouse", "Cheesy the Cheese"],
  "metadata": {{}}
}}"""

            user_prompt = f"""Story Outline:
{json.dumps(story_outline_description, indent=2)}

Create a complete detailed story for {panels} visual panels. Break it down into:
- 3 parts (beginning, middle, end)
- EXACTLY {panels} sections total (one per panel)
- Multiple segments per section (text for that panel)

Make each panel visually compelling. For each panel, emphasize the character description and action, setting details, any dialogue/caption box with specific text and the mood."""

        logger.info(f"[Job: {job_id}] Generating complete {story_type} story for user {user_id} - Genre: {genre}, Speakers: {number_of_speakers}, Model: {model_id}")
        
        # Retry logic to ensure speaker count matches
        max_retries = 3
        for attempt in range(max_retries):
            response = completion(
                model=model_id,
                response_format=CompleteStoryResult,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
            )
            
            # Parse the response content
            content = response.choices[0].message.content
            
            # If content is a string, parse it as JSON
            if isinstance(content, str):
                result_data = json.loads(content)
            else:
                # If it's already a Pydantic model
                result_data = content.dict() if hasattr(content, 'dict') else content
            
            # Add metadata
            if 'metadata' not in result_data:
                result_data['metadata'] = {}
            
            result_data['metadata'].update({
                "genre": genre,
                "reading_level": reading_level,
                "tone": tone,
                "story_type": story_type,
                "number_of_speakers": number_of_speakers,
                "created_timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": user_id,
                "job_id": job_id
            })
            
            # Add type-specific metadata
            if story_type == "visual":
                result_data['metadata']['panels'] = panels
            else:  # audio
                result_data['metadata']['audio_length'] = audio_length
            
            # Ensure speaker_names is in result
            if 'speaker_names' not in result_data:
                result_data['speaker_names'] = speaker_names
            
            # Clean segment content using the cleaning functions
            for part in result_data.get('story_parts', []):
                for section in part.get('sections', []):
                    for segment in section.get('segments', []):
                        # Get the original content and speaker
                        original_content = segment.get('segment_content', '')
                        speaker = segment.get('speaker', '')
                        
                        # Apply clean_unicode_characters to all segments
                        cleaned_content = clean_unicode_characters(original_content)
                        
                        # If speaker is not narrator, also apply extract_quoted_text
                        if speaker.lower() != "narrator":
                            cleaned_content = extract_quoted_text(cleaned_content)
                        
                        # Update the segment content with cleaned version
                        segment['segment_content'] = cleaned_content
            
            # Validate speaker count matches input
            actual_speaker_count = len(result_data.get('speaker_names', []))
            if actual_speaker_count == number_of_speakers:
                logger.info(f"[Job: {job_id}] Successfully generated complete {story_type} story for user {user_id} with correct speaker count")
                return result_data
            else:
                logger.warning(f"[Job: {job_id}] Attempt {attempt + 1}/{max_retries}: Speaker count mismatch. Expected {number_of_speakers}, got {actual_speaker_count}. Retrying...")
        
        # If all retries failed, log error and return the last result with a warning in metadata
        logger.error(f"[Job: {job_id}] Failed to generate story with correct speaker count after {max_retries} attempts")
        result_data['metadata']['speaker_count_warning'] = f"Expected {number_of_speakers} speakers, but got {len(result_data.get('speaker_names', []))} speakers after {max_retries} attempts"
        return result_data
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error generating complete story: {str(e)}")
        raise

def generate_story_outline_description(genre: str, reading_level: str, tone: str, user_input_description: str,
                                       story_type: str, number_of_speakers: int, user_id: str, job_id: str,
                                       panels: Optional[int] = None, audio_length: Optional[int] = None,
                                       model_id: str = "bedrock/us.amazon.nova-pro-v1:0") -> dict:
    """
    Generate a story outline description using LiteLLM with Bedrock
    
    Args:
        genre: Story genre (e.g., "fantasy", "adventure", "mystery")
        reading_level: Target reading level (e.g., "elementary", "middle school")
        tone: Story tone (e.g., "lighthearted", "serious", "humorous")
        user_input_description: User's description/prompt for the story
        story_type: Type of story ("audio" or "visual")
        number_of_speakers: Number of speakers (1-4)
        user_id: Cognito user ID
        job_id: Unique identifier for this story generation job
        panels: Number of panels (required if story_type="visual")
        audio_length: Audio length in minutes (required if story_type="audio")
        model_id: LLM model identifier (default: "bedrock/us.amazon.nova-pro-v1:0")
    
    Returns:
        For audio stories: 3 story parts (beginning, middle, end) with summaries and speakers
        For visual stories: Story outline with speaker information
    """
    try:
        # Validate story_type specific requirements
        if story_type == "visual" and panels is None:
            raise ValueError("panels is required when story_type is 'visual'")
        if story_type == "audio" and audio_length is None:
            raise ValueError("audio_length is required when story_type is 'audio'")
        
        # Validate number_of_speakers
        if not 1 <= number_of_speakers <= 4:
            raise ValueError("number_of_speakers must be between 1 and 4")
        
        if story_type == "audio":
            system_prompt = f"""You are a creative story outline generator for audio stories. Create a detailed 3-part story outline (beginning, middle, end) based on the user's description.

Genre: {genre}
Reading Level: {reading_level}
Tone: {tone}
Number of Speakers: {number_of_speakers}
Target Audio Length: {audio_length} minutes

Create a compelling story outline with {number_of_speakers} distinct speaker(s). Each speaker should have a unique voice and role in the story.

The response should include:
1. speaker_names: A list of {number_of_speakers} speaker name(s) (e.g., ["Narrator", "Max the Mouse", "Wise Owl"])
2. story_parts: Exactly 3 parts with:
   - story_part: "beginning", "middle", or "end"
   - story_part_summary: A detailed summary of what happens in this part (2-3 paragraphs)
   - story_part_speakers: List of speaker names actively involved in this part 

Make the story engaging, age-appropriate for {reading_level} level, and maintain a {tone} tone throughout."""

            user_prompt = f"""Create a {genre} story outline based on this description: {user_input_description}

The story should be approximately {audio_length} minutes when narrated as audio, with {number_of_speakers} speaker(s).
Make it appropriate for {reading_level} reading level with a {tone} tone. Always include the Narrator as a speaker in each section.

EXAMPLE OUTPUT FORMAT:
{{
        "speaker_names": [
        "Narrator",
        "Captain Woolbeard",
        "Captain Blackbeard"
        ],
        "story_parts": [
        {{
            "story_part_summary": "The story begins with Captain Woolbeard and his crew of sheep pirates living peacefully on their floating island. They are known throughout the pirate seas for their bravery and cunning.",
            "story_part": "beginning",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard"
            ]
        }},
        {{
            "story_part_summary": "One day, a ruthless human pirate crew led by the infamous Captain Blackbeard discovers the sheep pirates' floating island and plans to take it over. Captain Woolbeard and his crew must use their wits and teamwork to outsmart the human pirates and protect their home.",
            "story_part": "middle",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard",
            "Captain Blackbeard"
            ]
        }},
        {{    
            "story_part_summary": "In a thrilling climax, Captain Woolbeard and his sheep pirates manage to outwit Captain Blackbeard and his crew, saving their floating island. The story ends with the sheep pirates celebrating their victory and looking forward to more adventures on the pirate seas.",
            "story_part": "end",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard",
            "Captain Blackbeard"
            ]
        }}
        ],
    "metadata": {{}}
}}
"""

        else:  # visual
            system_prompt = f"""You are a creative story outline generator for visual stories. Create a detailed 3-part story outline (beginning, middle, end) based on the user's description.

Genre: {genre}
Reading Level: {reading_level}
Tone: {tone}
Number of Speakers: {number_of_speakers}
Total Panels: {panels}

Create a compelling story outline with {number_of_speakers} distinct speaker(s). Each speaker should have a unique voice and role in the story.

The response should include:
1. speaker_names: A list of {number_of_speakers} speaker name(s) (e.g., ["Narrator", "Max the Mouse", "Wise Owl"])
2. story_parts: Exactly 3 parts with:
   - story_part: "beginning", "middle", or "end"
   - story_part_summary: A detailed summary of what happens in this part, considering the visual medium
   - story_part_speakers: List of speaker names actively involved in this part

Make the story engaging, age-appropriate for {reading_level} level, and maintain a {tone} tone throughout.
Consider that this will be told across {panels} visual panels."""

            user_prompt = f"""Create a {genre} story outline based on this description: {user_input_description}

The story will be told across {panels} visual panels with {number_of_speakers} speaker(s).

Make it appropriate for {reading_level} reading level with a {tone} tone. Always include the Narrator as a speaker in each section.
EXAMPLE OUTPUT FORMAT:
{{
        "speaker_names": [
        "Narrator",
        "Captain Woolbeard",
        "Captain Blackbeard"
        ],
        "story_parts": [
        {{
            "story_part_summary": "The story begins with Captain Woolbeard and his crew of sheep pirates living peacefully on their floating island. They are known throughout the pirate seas for their bravery and cunning.",
            "story_part": "beginning",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard"
            ]
        }},
        {{
            "story_part_summary": "One day, a ruthless human pirate crew led by the infamous Captain Blackbeard discovers the sheep pirates' floating island and plans to take it over. Captain Woolbeard and his crew must use their wits and teamwork to outsmart the human pirates and protect their home.",
            "story_part": "middle",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard",
            "Captain Blackbeard"
            ]
        }},
        {{    
            "story_part_summary": "In a thrilling climax, Captain Woolbeard and his sheep pirates manage to outwit Captain Blackbeard and his crew, saving their floating island. The story ends with the sheep pirates celebrating their victory and looking forward to more adventures on the pirate seas.",
            "story_part": "end",
            "story_part_speakers": [
            "Narrator",
            "Captain Woolbeard",
            "Captain Blackbeard"
            ]
        }}
        ],
    "metadata": {{}}
}}
"""

        logger.info(f"[Job: {job_id}] Generating {story_type} story outline for user {user_id} - Genre: {genre}, Speakers: {number_of_speakers}, Model: {model_id}")
        
        # Retry logic to ensure speaker count matches
        max_retries = 3
        for attempt in range(max_retries):
            response = completion(
                model=model_id,
                response_format=StoryOutlineResult,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
            )
            
            # Parse the response content
            content = response.choices[0].message.content
            
            # If content is a string, parse it as JSON
            if isinstance(content, str):
                result_data = json.loads(content)
            else:
                # If it's already a Pydantic model
                result_data = content.dict() if hasattr(content, 'dict') else content
            
            # Add metadata
            if 'metadata' not in result_data:
                result_data['metadata'] = {}
            
            result_data['metadata'].update({
                "genre": genre,
                "reading_level": reading_level,
                "tone": tone,
                "user_input_description": user_input_description,
                "story_type": story_type,
                "number_of_speakers": number_of_speakers,
                "created_timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": user_id,
                "job_id": job_id
            })
            
            # Add type-specific metadata
            if story_type == "visual":
                result_data['metadata']['panels'] = panels
            else:  # audio
                result_data['metadata']['audio_length'] = audio_length
            
            # Validate speaker count matches input
            actual_speaker_count = len(result_data.get('speaker_names', []))
            if actual_speaker_count == number_of_speakers:
                logger.info(f"[Job: {job_id}] Successfully generated {story_type} story outline for user {user_id} with correct speaker count")
                return result_data
            else:
                logger.warning(f"[Job: {job_id}] Attempt {attempt + 1}/{max_retries}: Speaker count mismatch. Expected {number_of_speakers}, got {actual_speaker_count}. Retrying...")
        
        # If all retries failed, log error and return the last result with a warning in metadata
        logger.error(f"[Job: {job_id}] Failed to generate story outline with correct speaker count after {max_retries} attempts")
        result_data['metadata']['speaker_count_warning'] = f"Expected {number_of_speakers} speakers, but got {len(result_data.get('speaker_names', []))} speakers after {max_retries} attempts"
        return result_data
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error generating story outline: {str(e)}")
        raise

def regenerate_story_segment(user_id: str, job_id: str, user_request: str, original_story_segments: List[dict],
                            original_story_segment_num: int, original_story_segment: dict, genre: str,
                            reading_level: str, tone: str, story_type: str, number_of_speakers: int,
                            panels: Optional[int] = None, audio_length: Optional[int] = None,
                            model_id: str = "bedrock/us.amazon.nova-pro-v1:0") -> dict:
    """
    Regenerate a specific story segment using LiteLLM with Bedrock
    
    Args:
        user_id: Cognito user ID
        job_id: Unique identifier for this story generation job
        user_request: User's specific request for how to modify the segment
        original_story_segments: List of all story segments for context
        original_story_segment_num: The segment number to regenerate
        original_story_segment: The original segment object to regenerate
        genre: Story genre
        reading_level: Target reading level
        tone: Story tone
        story_type: Type of story ("audio" or "visual")
        number_of_speakers: Number of speakers (1-4)
        panels: Number of panels (required if story_type="visual")
        audio_length: Audio length in minutes (required if story_type="audio")
        model_id: LLM model identifier (default: "bedrock/us.amazon.nova-pro-v1:0")
    
    Returns:
        Dictionary with new_story_segment and metadata
    """
    try:
        # Validate story_type specific requirements
        if story_type == "visual" and panels is None:
            raise ValueError("panels is required when story_type is 'visual'")
        if story_type == "audio" and audio_length is None:
            raise ValueError("audio_length is required when story_type is 'audio'")
        
        # Validate number_of_speakers
        if not 1 <= number_of_speakers <= 4:
            raise ValueError("number_of_speakers must be between 1 and 4")
        
        story_type_context = ""
        if story_type == "visual":
            story_type_context = f"This is a visual story with {panels} panels. "
        else:
            story_type_context = f"This is an audio story of approximately {audio_length} minutes. "
        
        system_prompt = f"""You are a creative story editor. Regenerate story segment #{original_story_segment_num} based on the user's specific request.

Genre: {genre}
Reading Level: {reading_level}
Tone: {tone}
Story Type: {story_type}
Number of Speakers: {number_of_speakers}
{story_type_context}

User's Request: {user_request}

The new segment should have:
- segment_num: The segment number ({original_story_segment_num})
- segment_content: The improved narrative content, addressing the user's request
- speaker: Who is speaking/narrating (choose from the available speakers in the story)

Make sure the new content:
1. Addresses the user's specific request: {user_request}
2. Fits well with the overall story flow and maintains consistency with the {genre} genre
3. Remains age-appropriate for {reading_level} reading level with a {tone} tone
4. Is appropriate for {story_type} story format"""
        
        user_prompt = f"""Full Story Context (all segments):
{json.dumps(original_story_segments, indent=2)}

Original Segment #{original_story_segment_num} to regenerate:
{json.dumps(original_story_segment, indent=2)}

User's specific request: {user_request}

Create an improved version of segment #{original_story_segment_num} that:
- Addresses the user's request
- Maintains story continuity and consistency
- Fits the {genre} genre with a {tone} tone
- Is appropriate for {reading_level} reading level"""
        
        logger.info(f"[Job: {job_id}] Regenerating segment {original_story_segment_num} for user {user_id} with request: {user_request}, Model: {model_id}")
        
        response = completion(
            model=model_id,
            response_format=RegenerateSegmentResult,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
        )
        
        # Parse the response content
        content = response.choices[0].message.content
        
        # If content is a string, parse it as JSON
        if isinstance(content, str):
            result_data = json.loads(content)
        else:
            # If it's already a Pydantic model
            result_data = content.dict() if hasattr(content, 'dict') else content
        
        # Add metadata
        if 'metadata' not in result_data:
            result_data['metadata'] = {}
        
        result_data['metadata'].update({
            "user_id": user_id,
            "job_id": job_id,
            "user_request": user_request,
            "original_story_segments": original_story_segments,
            "original_story_segment_num": original_story_segment_num,
            "original_story_segment": original_story_segment,
            "genre": genre,
            "reading_level": reading_level,
            "tone": tone,
            "story_type": story_type,
            "number_of_speakers": number_of_speakers,
            "created_timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Add type-specific metadata
        if story_type == "visual":
            result_data['metadata']['panels'] = panels
        else:  # audio
            result_data['metadata']['audio_length'] = audio_length
        
        logger.info(f"[Job: {job_id}] Successfully regenerated segment {original_story_segment_num} for user {user_id}")
        return result_data
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error regenerating story segment: {str(e)}")
        raise

def generate_topics_ideas(genre: str, topics: str, user_id: str, job_id: str,
                         model_id: str = "bedrock/us.amazon.nova-pro-v1:0") -> dict:
    """
    Generate story ideas based on genre and topics using LiteLLM with Bedrock
    
    Args:
        genre: Story genre (fiction or non-fiction)
        topics: Topic or theme for story ideas
        user_id: Cognito user ID
        job_id: Unique identifier for this story generation job
        model_id: LLM model identifier (default: "bedrock/us.amazon.nova-pro-v1:0")
    
    Returns:
        Dictionary with story idea details including subject_category, scope_coverage, 
        structure, source_types, target_audience, tone, and metadata
    """
    try:
        # Validate genre
        if genre.lower() not in ['fiction', 'non-fiction']:
            raise ValueError("genre must be either 'fiction' or 'non-fiction'")
        
        system_prompt = f"""You are a creative story idea generator. Generate detailed story ideas and recommendations based on the provided genre and topics.

Genre: {genre}
Topics: {topics}

Create a comprehensive story idea recommendation with the following components:

1. subject_category: The main subject or category of the story (e.g., "Adventure", "Mystery", "Historical", "Science", "Biography")
2. scope_coverage: What aspects or areas the story should cover (e.g., "Character development and plot progression", "Historical events and their impact")
3. structure: Recommended structure for the story (e.g., "Three-act structure", "Linear narrative", "Episodic format")
4. source_types: Types of sources or inspiration to consider (e.g., "Historical records, personal accounts", "Myths and legends", "Scientific research")
5. target_audience: Who the story is best suited for (e.g., "Young adults aged 12-18", "Children aged 6-10", "General adult audience")
6. tone: Recommended tone for the story (e.g., "Lighthearted and adventurous", "Serious and educational", "Humorous and engaging")

IMPORTANT:
- For fiction: Focus on creative storytelling elements, character development, and imaginative themes
- For non-fiction: Focus on factual accuracy, educational value, and informative content
- Make recommendations age-appropriate and engaging
- Ensure consistency across all fields

EXAMPLE OUTPUT FORMAT for Fiction:
{{
  "subject_category": "Fantasy Adventure",
  "scope_coverage": "A magical journey exploring friendship",
  "structure": "Hero's journey with three main acts: departure, initiation, and return",
  "source_types": "Classic fantasy literature",
  "target_audience": "Children aged 8-12 and young adults",
  "tone": "Lighthearted and whimsical,
  "metadata": {{}}
}}

EXAMPLE OUTPUT FORMAT for Non-Fiction:
{{
  "subject_category": "Natural Science - Marine Biology",
  "scope_coverage": "Ocean ecosystems, conservation efforts",
  "structure": "Linear narrative",
  "source_types": "Scientific research papers",
  "target_audience": "Children aged 6-10",
  "tone": "Educational",
  "metadata": {{}}
}}"""

        user_prompt = f"""Generate story ideas for a {genre} story about: {topics}"""

        logger.info(f"[Job: {job_id}] Generating topic ideas for user {user_id} - Genre: {genre}, Topics: {topics}, Model: {model_id}")
        
        response = completion(
            model=model_id,
            response_format=TopicIdeasResult,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
        )
        
        # Parse the response content
        content = response.choices[0].message.content
        
        # If content is a string, parse it as JSON
        if isinstance(content, str):
            result_data = json.loads(content)
        else:
            # If it's already a Pydantic model
            result_data = content.dict() if hasattr(content, 'dict') else content
        
        # Add metadata
        if 'metadata' not in result_data:
            result_data['metadata'] = {}
        
        result_data['metadata'].update({
            "genre": genre,
            "topics": topics,
            "created_timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "job_id": job_id,
            "model_id": model_id
        })
        
        logger.info(f"[Job: {job_id}] Successfully generated topic ideas for user {user_id}")
        return result_data
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error generating topic ideas: {str(e)}")
        raise

def handler(event, context):
    """
    Lambda function handler for story text regeneration
    This function is protected by Cognito authentication via API Gateway
    """
    logger.info("Story text regeneration function invoked")
    logger.info(f"Event: {json.dumps(event)}")
    
    # Extract user information from Cognito claims if available
    user_info = {}
    if 'requestContext' in event:
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        if 'claims' in authorizer:
            claims = authorizer['claims']
            user_info = {
                'email': claims.get('email'),
                'sub': claims.get('sub'),
                'username': claims.get('cognito:username')
            }
            logger.info(f"Authenticated user: {user_info}")
    
    try:
        # Parse the request body
        body = json.loads(event.get('body', '{}'))
        
        # Determine route from API Gateway path
        path = event.get('path', '')
        if path.endswith('/generate-story'):
            route = 'generate_entire_story'
        elif path.endswith('/regenerate-segment'):
            route = 'regenerate_story_segment'
        elif path.endswith('/generate-story-outline'):
            route = 'generate_story_outline_description'
        elif path.endswith('/generate-topics-ideas'):
            route = 'generate_topics_ideas'
        else:
            route = body.get('route')  # Fallback to body route for backward compatibility
        
        if route == 'generate_entire_story':
            # Extract parameters
            genre = body.get('genre')
            reading_level = body.get('reading_level')
            tone = body.get('tone')
            story_outline_description = body.get('story_outline_description')
            story_type = body.get('story_type')
            number_of_speakers = body.get('number_of_speakers')
            job_id = body.get('job_id')
            panels = body.get('panels')  # Optional
            audio_length = body.get('audio_length')  # Optional
            model_id = body.get('model_id', 'bedrock/us.amazon.nova-pro-v1:0')  # Optional with default
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            if not all([genre, reading_level, tone, story_outline_description, story_type, number_of_speakers, job_id]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: genre, reading_level, tone, story_outline_description, story_type, number_of_speakers, job_id'
                    })
                }
            
            # Validate story_type specific requirements
            if story_type == 'visual' and panels is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'panels is required when story_type is "visual"'
                    })
                }
            
            if story_type == 'audio' and audio_length is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'audio_length is required when story_type is "audio"'
                    })
                }
            
            # Validate number_of_speakers range
            if not isinstance(number_of_speakers, int) or not 1 <= number_of_speakers <= 4:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'number_of_speakers must be an integer between 1 and 4'
                    })
                }
            
            # Generate complete story
            result = generate_entire_story(
                genre, reading_level, tone, story_outline_description, story_type,
                number_of_speakers, user_id, job_id, panels, audio_length, model_id
            )
            
            response_body = {
                'success': True,
                'route': 'generate_entire_story',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        elif route == 'regenerate_story_segment':
            # Extract parameters
            job_id = body.get('job_id')
            user_request = body.get('user_request')
            original_story_segments = body.get('original_story_segments')
            original_story_segment_num = body.get('original_story_segment_num')
            original_story_segment = body.get('original_story_segment')
            genre = body.get('genre')
            reading_level = body.get('reading_level')
            tone = body.get('tone')
            story_type = body.get('story_type')
            number_of_speakers = body.get('number_of_speakers')
            panels = body.get('panels')  # Optional
            audio_length = body.get('audio_length')  # Optional
            model_id = body.get('model_id', 'bedrock/us.amazon.nova-pro-v1:0')  # Optional with default
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            required_params = [
                job_id, user_request, original_story_segments, original_story_segment_num,
                original_story_segment, genre, reading_level, tone, story_type, number_of_speakers
            ]
            if not all(param is not None for param in required_params):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: job_id, user_request, original_story_segments, original_story_segment_num, original_story_segment, genre, reading_level, tone, story_type, number_of_speakers'
                    })
                }
            
            # Validate story_type specific requirements
            if story_type == 'visual' and panels is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'panels is required when story_type is "visual"'
                    })
                }
            
            if story_type == 'audio' and audio_length is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'audio_length is required when story_type is "audio"'
                    })
                }
            
            # Validate number_of_speakers range
            if not isinstance(number_of_speakers, int) or not 1 <= number_of_speakers <= 4:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'number_of_speakers must be an integer between 1 and 4'
                    })
                }
            
            # Regenerate segment
            result = regenerate_story_segment(
                user_id, job_id, user_request, original_story_segments,
                original_story_segment_num, original_story_segment, genre,
                reading_level, tone, story_type, number_of_speakers,
                panels, audio_length, model_id
            )
            
            response_body = {
                'success': True,
                'route': 'regenerate_story_segment',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        elif route == 'generate_story_outline_description':
            # Extract parameters
            genre = body.get('genre')
            reading_level = body.get('reading_level')
            tone = body.get('tone')
            user_input_description = body.get('user_input_description')
            story_type = body.get('story_type')
            number_of_speakers = body.get('number_of_speakers')
            job_id = body.get('job_id')
            panels = body.get('panels')  # Optional
            audio_length = body.get('audio_length')  # Optional
            model_id = body.get('model_id', 'bedrock/us.amazon.nova-pro-v1:0')  # Optional with default
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            if not all([genre, reading_level, tone, user_input_description, story_type, number_of_speakers, job_id]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: genre, reading_level, tone, user_input_description, story_type, number_of_speakers, job_id'
                    })
                }
            
            # Validate story_type specific requirements
            if story_type == 'visual' and panels is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'panels is required when story_type is "visual"'
                    })
                }
            
            if story_type == 'audio' and audio_length is None:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'audio_length is required when story_type is "audio"'
                    })
                }
            
            # Validate number_of_speakers range
            if not isinstance(number_of_speakers, int) or not 1 <= number_of_speakers <= 4:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'number_of_speakers must be an integer between 1 and 4'
                    })
                }
            
            # Generate story outline
            result = generate_story_outline_description(
                genre, reading_level, tone, user_input_description, story_type, 
                number_of_speakers, user_id, job_id, panels, audio_length, model_id
            )
            
            response_body = {
                'success': True,
                'route': 'generate_story_outline_description',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        elif route == 'generate_topics_ideas':
            # Extract parameters
            genre = body.get('genre')
            topics = body.get('topics')
            job_id = body.get('job_id')
            model_id = body.get('model_id', 'bedrock/us.amazon.nova-pro-v1:0')  # Optional with default
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            if not all([genre, topics, job_id]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: genre, topics, job_id'
                    })
                }
            
            # Validate genre
            if genre.lower() not in ['fiction', 'non-fiction']:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'genre must be either "fiction" or "non-fiction"'
                    })
                }
            
            # Generate topic ideas
            result = generate_topics_ideas(
                genre, topics, user_id, job_id, model_id
            )
            
            response_body = {
                'success': True,
                'route': 'generate_topics_ideas',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        else:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': f'Invalid route: {route}. Valid routes are: generate_entire_story, regenerate_story_segment, generate_story_outline_description, generate_topics_ideas'
                })
            }
        
        logger.info("Story text regeneration completed successfully")
        
        # Write to DynamoDB for tracking (non-blocking)
        try:
            user_id = user_info.get('sub', 'anonymous')
            session_id = body.get('job_id', body.get('session_id', f"session_{datetime.now(timezone.utc).timestamp()}"))
            route = response_body.get('route', 'unknown')
            
            write_to_dynamodb(
                user_id=user_id,
                session_id=session_id,
                route=route,
                request_data=body,
                response_data=response_body
            )
        except Exception as e:
            # Log but don't fail the request if DynamoDB write fails
            logger.error(f"Error writing to DynamoDB tracking: {str(e)}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_body)
        }
        
    except Exception as e:
        logger.error(f"Error in story text regeneration: {str(e)}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e),
                'request_id': context.aws_request_id
            })
        }
