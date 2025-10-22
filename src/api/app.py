"""
FastAPI application for Story Creator backend.

Provides RESTful API endpoints for frontend integration.
"""

import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv

from src.models.story_models import APIResponse
from src.tools.storage_factory import save_session, load_session
from src.api.story_pipeline_streaming import register_pipeline_endpoint
from src.api.auth_routes import register_auth_routes
from src.api.stories_routes import register_stories_routes
from src.tools.file_storage import init_storage, STORAGE_ROOT, IMAGES_DIR, STORIES_DIR

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Story Creator API",
    description="AI-powered story creation with audiobook and visual book generation",
    version="1.0.0"
)


# Initialize storage on startup
@app.on_event("startup")
async def startup_event():
    """Initialize storage directories on application startup."""
    storage_info = init_storage()
    print(f"✅ Storage initialized: {storage_info['storage_root']}")

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Set to False when using allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)


# Request/Response Models
class StartSessionRequest(BaseModel):
    """Request to start a new story session."""
    user_id: str
    story_idea: str


class SelectConceptRequest(BaseModel):
    """Request to select a story concept."""
    session_id: str
    selected_concept: dict  # The full concept object


class GenerateMoreRequest(BaseModel):
    """Request to generate similar concepts."""
    session_id: str
    base_concept: dict  # The full concept to base variations on


class ApproveSceneRequest(BaseModel):
    """Request to approve a scene."""
    session_id: str
    user_id: str
    scene_id: str


class RewriteSceneRequest(BaseModel):
    """Request to rewrite a scene."""
    session_id: str
    user_id: str
    scene_id: str
    rewrite_type: str  # "ai_assisted" or "user_provided"
    feedback: Optional[str] = None
    user_content: Optional[str] = None


class DraftStoryRequest(BaseModel):
    """Request to draft a story from selected concept."""
    session_id: str
    
    class Config:
        extra = "forbid"  # Industry standard: Reject unexpected fields


class SelectFormatRequest(BaseModel):
    """Request to select output format."""
    session_id: str
    user_id: str
    output_format: str  # "audio", "visual", or "both"


class SelectNarratorRequest(BaseModel):
    """Request to select narrator."""
    session_id: str
    user_id: str
    narrator_id: str


# API Endpoints

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "Story Creator API",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "aws_region": os.getenv("AWS_REGION", "us-east-1")
    }


# OLD ENDPOINT - Replaced by /api/v1/story/generate-pipeline
# @app.post("/api/v1/story/start", response_model=APIResponse)
# async def start_story_session(request: StartSessionRequest):
#     """
#     [DEPRECATED] Use /api/v1/story/generate-pipeline instead
#     """
#     pass


# OLD ENDPOINT - Replaced by /api/v1/story/generate-pipeline
# @app.post("/api/v1/story/generate-more", response_model=APIResponse)
# async def generate_more_concepts(request: GenerateMoreRequest):
#     """
#     [DEPRECATED] Use /api/v1/story/generate-pipeline instead
#     """
#     pass


@app.post("/api/v1/story/select-concept", response_model=APIResponse)
async def select_concept(request: SelectConceptRequest):
    """
    User selects a concept to develop into a full story.
    
    Initiates story drafting with scenes.
    
    **Response Codes:**
    - 200: Concept selected successfully
    - 422: Invalid request data (Pydantic validation)
    - 500: Server error during processing
    """
    try:
        print(f"✅ Concept selected: {request.selected_concept.get('title', 'Unknown')}")
        
        # Load session and save selected concept
        try:
            session_data = await load_session(request.session_id)
            session_data["selected_concept"] = request.selected_concept
            session_data["stage"] = "concept_selected"
            await save_session(request.session_id, session_data)
            print(f"✅ Saved concept to session: {request.session_id}")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Session {request.session_id} not found")
        
        return APIResponse(
            success=True,
            message=f"Concept '{request.selected_concept.get('title')}' selected successfully",
            data={
                "session_id": request.session_id,
                "selected_concept": request.selected_concept,
                "next_step": "story_drafting",
                "status": "concept_selected"
            }
        )
    except Exception as e:
        import traceback
        print("=" * 80)
        print("ERROR in select_concept:")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


# OLD ENDPOINT - Replaced by /api/v1/story/generate-pipeline
# @app.post("/api/v1/story/draft", response_model=APIResponse)
# async def draft_story(request: DraftStoryRequest):
#     """
#     [DEPRECATED] Use /api/v1/story/generate-pipeline instead
#     """
#     pass


@app.post("/api/v1/story/approve-scene", response_model=APIResponse)
async def approve_scene(request: ApproveSceneRequest):
    """
    User approves a scene as-is.
    
    Marks scene as approved and checks if all scenes are complete.
    
    **Response Codes:**
    - 200: Scene approved successfully
    - 422: Invalid request data
    - 404: Scene or session not found
    - 500: Server error
    """
    try:
        print(f"✅ Approving scene: {request.scene_id} in session: {request.session_id}")
        
        # Load session and draft
        try:
            session_data = await load_session(request.session_id)
            draft_data = session_data.get("draft")
            
            if not draft_data:
                raise HTTPException(status_code=404, detail="No draft found for this session")
            
            # Find and update scene status
            scene_found = False
            for scene in draft_data.get("scenes", []):
                if scene.get("scene_id") == request.scene_id:
                    scene["status"] = "approved"
                    scene_found = True
                    print(f"✅ Approved scene: {scene.get('title')}")
                    break
            
            if not scene_found:
                raise HTTPException(status_code=404, detail=f"Scene {request.scene_id} not found")
            
            # Save updated draft
            session_data["draft"] = draft_data
            await save_session(request.session_id, session_data)
            
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Session {request.session_id} not found")
        
        return APIResponse(
            success=True,
            message=f"Scene '{request.scene_id}' approved successfully",
            data={
                "session_id": request.session_id,
                "scene_id": request.scene_id,
                "status": "approved",
                "next_action": "continue"
            }
        )
    except Exception as e:
        import traceback
        print("=" * 80)
        print("ERROR in approve_scene:")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        print("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


# OLD ENDPOINT - Replaced by /api/v1/story/generate-pipeline
# @app.post("/api/v1/story/rewrite-scene", response_model=APIResponse)
# async def rewrite_scene(request: RewriteSceneRequest):
#     """
#     [DEPRECATED] Use /api/v1/story/generate-pipeline instead
#     """
#     pass


@app.post("/api/v1/story/select-format", response_model=APIResponse)
async def select_format(request: SelectFormatRequest):
    """
    User selects output format: audio, visual, or both.
    
    If audio is selected, returns available narrators for selection.
    
    **TODO:** Implement parallel generation Graph for audio/visual
    """
    try:
        # Load session and update format
        session_data = await load_session(request.session_id)
        session_data["output_format"] = request.output_format
        session_data["stage"] = "format_selected"
        await save_session(request.session_id, session_data)
        
        return APIResponse(
            success=True,
            message="Format selected",
            data={
                "session_id": request.session_id,
                "output_format": request.output_format,
                "stage": "format_selected",
                "next_step": "narrator_selection" if request.output_format in ["audio", "both"] else "generation"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/story/select-narrator", response_model=APIResponse)
async def select_narrator(request: SelectNarratorRequest):
    """
    User selects narrator voice for audiobook.
    
    Initiates final generation process using Graph for parallel generation.
    
    **TODO:** Implement parallel audio/image generation Graph
    """
    try:
        # Load session and update narrator
        session_data = await load_session(request.session_id)
        session_data["selected_narrator"] = request.narrator_id
        session_data["stage"] = "generation"
        await save_session(request.session_id, session_data)
        
        return APIResponse(
            success=True,
            message="Narrator selected, generating output",
            data={
                "session_id": request.session_id,
                "narrator_id": request.narrator_id,
                "stage": "generation",
                "message": "Generation started (parallel Graph execution)"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/story/session/{session_id}", response_model=APIResponse)
async def get_session(session_id: str, user_id: str):
    """
    Retrieve an existing session to resume work.
    
    Enables users to continue where they left off.
    """
    try:
        session_data = await load_session(session_id)
        
        return APIResponse(
            success=True,
            message="Session loaded",
            data={
                "session": session_data,
                "message": f"Session loaded. Current stage: {session_data.get('stage', 'unknown')}"
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================================================================
# STREAMING ENDPOINTS REGISTRATION
# ================================================================================

# Register story pipeline endpoint (multi-agent orchestration with real-time streaming)
register_pipeline_endpoint(app)

# Register authentication routes
register_auth_routes(app)

# Register stories management routes
register_stories_routes(app)

# Register audio generation routes
from src.api.audio_routes import register_audio_routes
register_audio_routes(app)


# ================================================================================
# FILE SERVING ENDPOINTS
# ================================================================================

@app.get("/api/v1/images/{session_id}/{filename}")
async def serve_image(session_id: str, filename: str):
    """
    Serve generated images for a story session.
    
    Args:
        session_id: Story session identifier
        filename: Image filename (e.g., scene_1.png)
    
    Returns:
        Image file
    """
    image_path = IMAGES_DIR / session_id / filename
    
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(image_path, media_type="image/png")


@app.get("/api/v1/stories/{session_id}/download")
async def download_story(session_id: str, format: str = "txt"):
    """
    Download a generated story.
    
    Args:
        session_id: Story session identifier
        format: Download format (txt, json)
    
    Returns:
        Story file
    """
    if format == "txt":
        story_path = STORIES_DIR / session_id / 'story.txt'
        media_type = "text/plain"
    elif format == "json":
        story_path = STORIES_DIR / session_id / 'story.json'
        media_type = "application/json"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'txt' or 'json'")
    
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    
    return FileResponse(
        story_path,
        media_type=media_type,
        filename=f"story_{session_id}.{format}"
    )


@app.get("/api/v1/stories/list")
async def list_stories(limit: int = 50):
    """
    List all generated stories.
    
    Args:
        limit: Maximum number of stories to return
    
    Returns:
        List of story metadata
    """
    from src.tools.file_storage import list_all_stories
    
    stories = await list_all_stories(limit=limit)
    
    # Enhance metadata with image count and word count
    enhanced_stories = []
    for story in stories:
        enhanced = {
            'session_id': story.get('session_id', ''),
            'topic': story.get('topic', 'Untitled Story'),
            'created_at': story.get('generated_at', ''),
            'total_words': story.get('word_count', 0),
            'images_count': len(story.get('chapters', [])) if story.get('chapters') else 3
        }
        enhanced_stories.append(enhanced)
    
    return {
        "stories": enhanced_stories,
        "count": len(enhanced_stories)
    }


# Run the application
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENVIRONMENT") == "development"
    )

