"""
Pydantic models for structured story output.

These models define the exact structure we expect from the LLM,
eliminating the need for regex parsing and ensuring type-safe data.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class DialogueLine(BaseModel):
    """A single line of dialogue or narration."""
    speaker: str = Field(
        description="The speaker of this line. Use 'Narrator' for narration, or character name for dialogue."
    )
    text: str = Field(
        description="The actual text content of this line"
    )


class Chapter(BaseModel):
    """A single chapter of the story."""
    chapter_number: int = Field(
        description="The chapter number (1, 2, 3, etc.)"
    )
    title: str = Field(
        description="The title of this chapter"
    )
    lines: List[DialogueLine] = Field(
        description="All dialogue and narration lines in this chapter, in order. "
                    "Use 'Narrator' for scene descriptions and narration. "
                    "Use character names (e.g., 'Kaveh', 'Mirza') for spoken dialogue."
    )


class StoryStructure(BaseModel):
    """Complete structured story with chapters and properly formatted dialogue."""
    title: str = Field(
        description="The title of the story"
    )
    characters: List[str] = Field(
        description="List of main character names in the story (excluding 'Narrator'). "
                    "MAXIMUM 3 characters for text-to-speech voice support."
    )
    chapters: List[Chapter] = Field(
        description="All chapters of the story in order"
    )
    
    def to_tts_script(self) -> tuple[str, List[str], Dict[str, str]]:
        """
        Convert structured story to TTS script format.
        
        Speaker 1 is ALWAYS the narrator.
        Characters map to Speaker 2, 3, 4 (max 3 characters).
        Tech42 TTS supports 4 speakers total: 1 narrator + 3 characters.
        
        Returns:
            Tuple of (formatted_script, unique_speakers_list, speaker_mapping)
        """
        # Map Narrator to Speaker 1, characters to Speaker 2, 3, 4
        speaker_mapping: Dict[str, str] = {"Narrator": "Speaker 1"}
        speaker_num = 2
        for char in self.characters[:3]:  # Max 3 character speakers (Speaker 2-4)
            speaker_mapping[char] = f"Speaker {speaker_num}"
            speaker_num += 1
        
        # Format all lines
        lines = []
        for chapter in self.chapters:
            for line in chapter.lines:
                speaker = line.speaker
                # Map to numbered speakers
                if speaker in speaker_mapping:
                    speaker = speaker_mapping[speaker]
                else:
                    # Unmapped character defaults to Speaker 1 (narrator)
                    speaker = "Speaker 1"
                
                lines.append(f"{speaker}: {line.text}")
        
        formatted_script = "\n".join(lines)
        
        # Get unique speakers used in script
        speakers_used = set()
        for chapter in self.chapters:
            for line in chapter.lines:
                if line.speaker in speaker_mapping:
                    speakers_used.add(speaker_mapping[line.speaker])
                else:
                    speakers_used.add("Speaker 1")  # Default to narrator
        
        # Return ordered list of speakers (Speaker 1 is always first)
        # Max 4 speakers: Speaker 1, 2, 3, 4
        unique_speakers = []
        for i in range(1, 5):  # Range 1-4 (inclusive)
            speaker_name = f"Speaker {i}"
            if speaker_name in speakers_used:
                unique_speakers.append(speaker_name)
        
        return formatted_script, unique_speakers, speaker_mapping
    
    def get_chapter_texts(self) -> List[tuple[int, str]]:
        """
        Get chapter texts for image generation.
        
        Returns:
            List of tuples (chapter_number, chapter_text)
        """
        result = []
        for chapter in self.chapters:
            # Combine all lines in chapter into single text
            chapter_text = " ".join([line.text for line in chapter.lines])
            result.append((chapter.chapter_number, chapter_text))
        return result

