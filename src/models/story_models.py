"""
Data models for the Story Creator system.

These Pydantic models define the structure for all data flowing through
the story creation pipeline, ensuring type safety and validation.
"""

from typing import List, Literal, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class StoryConcept(BaseModel):
    """
    A story concept generated from user input.
    
    Represents one of three initial story ideas presented to the user.
    """
    concept_id: str = Field(..., description="Unique identifier for this concept")
    title: str = Field(..., description="Engaging story title")
    premise: str = Field(..., description="2-3 sentence story premise")
    genre: str = Field(..., description="Story genre (e.g., mystery, sci-fi, romance)")
    target_audience: str = Field(..., description="Intended audience (e.g., young adult, adult)")
    estimated_length: str = Field(..., description="Estimated story length (e.g., short story, novella, novel)")
    key_themes: List[str] = Field(default_factory=list, description="Main themes explored")


class StoryScene(BaseModel):
    """
    A single scene in the story draft.
    
    Stories are broken into manageable scenes that users can approve or request changes to.
    """
    scene_id: str = Field(..., description="Unique identifier for this scene")
    scene_number: int = Field(..., description="Sequential scene number")
    title: str = Field(..., description="Scene title or heading")
    content: str = Field(..., description="Full scene text content")
    setting: str = Field(..., description="Where and when the scene takes place")
    characters: List[str] = Field(default_factory=list, description="Characters appearing in this scene")
    status: Literal["pending", "approved", "needs_revision"] = Field(
        default="pending",
        description="Approval status from user"
    )
    revision_notes: Optional[str] = Field(None, description="User feedback for revision")


class StoryDraft(BaseModel):
    """
    Complete story draft with all scenes.
    
    Represents the full story structure that users review scene-by-scene.
    """
    draft_id: str = Field(..., description="Unique identifier for this draft")
    concept_id: str = Field(..., description="Which concept this draft is based on")
    title: str = Field(..., description="Story title")
    synopsis: str = Field(..., description="Full story synopsis")
    scenes: List[StoryScene] = Field(default_factory=list, description="All story scenes")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RewriteRequest(BaseModel):
    """
    User request to rewrite a scene.
    
    Can be user-provided rewrite or AI-assisted rewrite based on feedback.
    """
    scene_id: str = Field(..., description="Scene to rewrite")
    rewrite_type: Literal["user_provided", "ai_assisted"] = Field(
        ...,
        description="Whether user provides new content or AI rewrites based on feedback"
    )
    user_content: Optional[str] = Field(None, description="User-provided rewrite content")
    feedback: Optional[str] = Field(None, description="User feedback for AI-assisted rewrite")


class NarratorProfile(BaseModel):
    """
    Voice narrator configuration for audiobook generation.
    
    Users select from available narrator voices with different characteristics.
    """
    narrator_id: str = Field(..., description="Unique identifier for this narrator")
    name: str = Field(..., description="Narrator display name")
    voice_id: str = Field(..., description="Technical voice ID for the TTS service")
    gender: str = Field(..., description="Voice gender")
    accent: str = Field(..., description="Voice accent (e.g., British, American)")
    tone: str = Field(..., description="Voice tone characteristics")
    sample_audio_url: Optional[str] = Field(None, description="Sample audio for preview")


class ImageGenerationRequest(BaseModel):
    """
    Request to generate an image for a scene.
    
    Used for visual book creation with illustrations.
    """
    scene_id: str = Field(..., description="Scene this image is for")
    prompt: str = Field(..., description="Image generation prompt")
    style: str = Field(default="realistic", description="Art style (e.g., realistic, illustration, watercolor)")
    aspect_ratio: str = Field(default="16:9", description="Image aspect ratio")


class GeneratedImage(BaseModel):
    """
    AI-generated image for a story scene.
    """
    image_id: str = Field(..., description="Unique identifier for this image")
    scene_id: str = Field(..., description="Associated scene")
    url: str = Field(..., description="URL to the generated image")
    prompt_used: str = Field(..., description="Prompt used for generation")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AudioSegment(BaseModel):
    """
    Generated audio for a story scene.
    """
    audio_id: str = Field(..., description="Unique identifier for this audio")
    scene_id: str = Field(..., description="Associated scene")
    narrator_id: str = Field(..., description="Which narrator voice was used")
    audio_url: str = Field(..., description="URL to the audio file")
    duration_seconds: float = Field(..., description="Audio duration")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StorySession(BaseModel):
    """
    Complete user session state for story creation.
    
    Persisted to enable resuming work across multiple interactions.
    """
    session_id: str = Field(..., description="Unique session identifier")
    user_id: str = Field(..., description="User identifier")
    original_prompt: str = Field(..., description="Initial user idea")
    generated_concepts: List[StoryConcept] = Field(default_factory=list)
    selected_concept_id: Optional[str] = Field(None, description="Which concept user selected")
    current_draft: Optional[StoryDraft] = Field(None)
    output_format: Optional[Literal["audio", "visual", "both"]] = Field(None)
    selected_narrator: Optional[NarratorProfile] = Field(None)
    generated_images: List[GeneratedImage] = Field(default_factory=list)
    generated_audio: List[AudioSegment] = Field(default_factory=list)
    current_stage: Literal[
        "idea_generation",
        "concept_selection",
        "drafting",
        "revision",
        "format_selection",
        "narrator_selection",
        "generation",
        "completed"
    ] = Field(default="idea_generation")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class APIResponse(BaseModel):
    """
    Standard API response format for frontend integration.
    """
    success: bool
    message: str
    data: Optional[dict] = None
    error: Optional[str] = None

