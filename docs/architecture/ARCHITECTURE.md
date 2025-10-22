# Story Creator Agent - System Architecture

## Overview

The Story Creator Agent is a production-grade AI system built with Strands Agents SDK that enables users to create professional audiobooks and visual books through an intelligent, iterative workflow.

## Architecture Pattern: Coordinator with Specialized Agents

### Why This Pattern?

We use a **Coordinator Pattern** with specialized agents rather than a pure Graph or Workflow pattern because:

1. **User Interaction**: Multiple decision points require user input between stages
2. **State Management**: Long-running sessions need persistent state across interactions
3. **Flexibility**: Users can iterate, go back, and revise at any stage
4. **Specialized Expertise**: Different creative tasks benefit from agents with focused system prompts

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React/Vue)                   │
│              User Interface & Experience                 │
└────────────────────┬────────────────────────────────────┘
                     │ REST API (FastAPI)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              StoryCoordinator                            │
│  - Session Management                                    │
│  - Workflow Orchestration                                │
│  - State Persistence                                     │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬───────────────┐
         ▼           ▼           ▼               ▼
┌──────────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐
│IdeaGenerator │ │ Story   │ │Rewriter │ │   Tools     │
│   Agent      │ │Drafter  │ │ Agent   │ │             │
│              │ │ Agent   │ │         │ │- Voice Gen  │
│Creates 3     │ │         │ │Refines  │ │- Image Gen  │
│concepts      │ │Scenes & │ │based on │ │- State Mgmt │
│from prompt   │ │segments │ │feedback │ │             │
└──────────────┘ └─────────┘ └─────────┘ └─────────────┘
                                                │
                     ┌──────────────────────────┴────┐
                     ▼                               ▼
              ┌──────────────┐            ┌─────────────────┐
              │Voice Service │            │  Image Service  │
              │(Container)   │            │  (API)          │
              │TTS Engine    │            │  SD/DALL-E      │
              └──────────────┘            └─────────────────┘
                     │                               │
                     └───────────────┬───────────────┘
                                     ▼
                          ┌────────────────────┐
                          │   AWS Storage      │
                          │- DynamoDB (state)  │
                          │- S3 (audio/images) │
                          └────────────────────┘
```

## Workflow Stages

### Stage 1: Idea Generation
**Agent**: `IdeaGeneratorAgent`  
**Input**: User's story idea (text prompt)  
**Output**: 3 distinct story concepts  
**User Actions**: 
- Select a concept
- Generate "more like this"
- Start over with new prompt

**Why High Temperature (0.9)?**  
Creative ideation benefits from diverse, novel suggestions. Higher temperature encourages exploration of different genres, tones, and approaches.

---

### Stage 2: Concept Selection
**Agent**: N/A (User decision)  
**Input**: 3 story concepts  
**Output**: Selected concept ID  
**User Actions**:
- Click on one of three concept cards
- Click "Create More Like This" on any card
- Return to Stage 1

---

### Stage 3: Story Drafting
**Agent**: `StoryDraftingAgent`  
**Input**: Selected concept  
**Output**: Complete draft with 4-6 scenes  
**User Actions**: Review scenes scene-by-scene

**Why Medium Temperature (0.7)?**  
Balances creativity with coherence. Stories need logical flow and consistency while remaining engaging.

**Scene Structure**:
Each scene includes:
- `scene_id`: Unique identifier
- `scene_number`: Sequential order
- `title`: Scene heading
- `content`: 300-800 words of prose
- `setting`: Where/when
- `characters`: Who appears
- `status`: pending/approved/needs_revision

---

### Stage 4: Revision/Approval
**Agent**: `RewriterAgent` (when changes needed)  
**Input**: Scene + user feedback or new content  
**Output**: Revised scene  
**User Actions**:
- **Approve**: Mark scene as final
- **AI Rewrite**: Provide feedback, AI rewrites
- **Manual Rewrite**: Provide new content, AI polishes

**Why Lower Temperature (0.6)?**  
Rewrites must preserve established story elements. Lower temperature ensures consistency with approved scenes and maintains character voices.

**Iteration Loop**: Users can revise the same scene multiple times until satisfied.

---

### Stage 5: Format Selection
**Agent**: N/A (User decision)  
**Input**: N/A  
**Output**: "audio", "visual", or "both"  
**User Actions**: Select desired output format

**Format Options**:
- **Audio**: Generates audiobook with narrator voice
- **Visual**: Generates illustrations for scenes
- **Both**: Creates multimedia book with audio + images

---

### Stage 6: Narrator Selection (If Audio)
**Agent**: N/A (User decision via tool)  
**Tool**: `get_available_narrators`  
**Input**: N/A  
**Output**: Selected narrator ID  
**User Actions**: Listen to samples, select voice

**Narrator Characteristics**:
- Voice ID (technical identifier for TTS)
- Gender
- Accent (British, American, etc.)
- Tone (warm, authoritative, clear, etc.)
- Sample audio URL

---

### Stage 7: Generation
**Tools**: `generate_voice_audio`, `generate_scene_image`  
**Input**: Approved scenes + format + narrator  
**Output**: Audio files and/or images  

**Process**:
1. For each approved scene:
   - Generate audio (if audio format selected)
   - Generate image (if visual format selected)
2. Upload artifacts to S3
3. Store URLs in session

**Production Note**: This stage should run as background jobs with progress updates via WebSocket or polling.

---

### Stage 8: Completed
**Output**: URLs to all generated assets  
**User Actions**: Download, share, or start new story

---

## Data Models

All data structures are defined as Pydantic models in `src/models/story_models.py`:

- **StoryConcept**: Individual story idea
- **StoryScene**: Single scene in draft
- **StoryDraft**: Complete draft with scenes
- **StorySession**: Full session state (persisted)
- **NarratorProfile**: Voice characteristics
- **GeneratedImage**: Image metadata
- **AudioSegment**: Audio file metadata

---

## State Management

### Session Persistence

**Primary Storage**: DynamoDB  
**Secondary Storage**: S3 (for large content)

**Why DynamoDB?**
- Fast key-value access by session_id
- TTL for automatic cleanup (30 days)
- Scalable for many concurrent users
- Global Secondary Index on user_id for listing sessions

**Why S3?**
- Large story drafts (>400KB)
- Generated audio files
- Generated image files
- Presigned URLs for secure temporary access

**Session Schema**:
```json
{
  "session_id": "uuid",
  "user_id": "user_123",
  "original_prompt": "A detective who can see ghosts",
  "generated_concepts": [...],
  "selected_concept_id": "uuid",
  "current_draft": {...},
  "output_format": "both",
  "selected_narrator": {...},
  "generated_audio": [...],
  "generated_images": [...],
  "current_stage": "revision",
  "created_at": "2025-09-30T...",
  "updated_at": "2025-09-30T..."
}
```

---

## External Service Integration

### Voice Generation Container

**Protocol**: HTTP REST API  
**Endpoint**: `/api/v1/generate`  
**Method**: POST  
**Timeout**: 120 seconds (audio generation is slow)

**Request**:
```json
{
  "text": "Story text to narrate",
  "voice_id": "en-GB-male-1",
  "metadata": {"scene_id": "uuid"}
}
```

**Response**:
```json
{
  "audio_url": "https://...",
  "duration": 123.45,
  "format": "mp3"
}
```

**Error Handling**: Graceful fallback to text-only if service unavailable.

---

### Image Generation Service

**Protocol**: HTTP REST API  
**Endpoint**: `/api/v1/generate`  
**Method**: POST  
**Timeout**: 180 seconds (image generation is slower)

**Request**:
```json
{
  "prompt": "Victorian detective office, foggy night...",
  "style": "realistic",
  "aspect_ratio": "16:9",
  "metadata": {"scene_id": "uuid"}
}
```

**Response**:
```json
{
  "image_url": "https://...",
  "generation_time": 45.2
}
```

**Batch Endpoint**: `/api/v1/generate/batch` for multiple images in parallel.

---

## AWS Bedrock Integration

### Model Selection

**Default Model**: `anthropic.claude-3-5-sonnet-20241022-v2:0`

**Why Claude 3.5 Sonnet?**
- **Creative Writing Excellence**: Strong narrative coherence
- **Long Context**: 200K tokens for full story context
- **Structured Output**: Reliable JSON generation
- **Instruction Following**: Precise adherence to system prompts

**Alternative Models**:
- **Claude 3.5 Haiku**: Faster, cheaper for simple tasks
- **Claude 3 Opus**: Maximum quality for premium tier

### Cost Optimization

1. **Temperature Tuning**: Lower temperature = more deterministic = fewer retries
2. **Prompt Caching**: Reuse system prompts across requests
3. **Streaming**: Show progress to users during generation
4. **Model Routing**: Use Haiku for rewrites, Sonnet for initial generation

---

## API Layer

**Framework**: FastAPI  
**Authentication**: (To be implemented - JWT, API keys, or AWS Cognito)  
**CORS**: Configurable for frontend domains  
**Rate Limiting**: (To be implemented)

**Key Endpoints**:
- `POST /api/v1/story/start` - Start new session
- `POST /api/v1/story/select-concept` - Select and draft
- `POST /api/v1/story/approve-scene` - Approve scene
- `POST /api/v1/story/rewrite-scene` - Request rewrite
- `POST /api/v1/story/select-format` - Choose output format
- `GET /api/v1/story/session/{id}` - Resume session

**Response Format**:
```json
{
  "success": true,
  "message": "Scene approved",
  "data": {...},
  "error": null
}
```

---

## Deployment Architecture

### AWS Bedrock AgentCore (Recommended)

**Why AgentCore?**
- **Serverless**: No infrastructure management
- **Scalable**: Auto-scales with demand
- **Secure**: Built-in IAM integration
- **Cost-Effective**: Pay only for invocations

**Alternative Deployments**:
- **AWS ECS/Fargate**: For containerized deployment
- **AWS Lambda**: For lightweight API
- **AWS EC2**: For full control

See `docs/deployment/bedrock_agentcore.md` for detailed deployment steps.

---

## Security Considerations

### IAM Permissions

Bedrock model access:
```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*:*:foundation-model/anthropic.claude-*"
}
```

DynamoDB access:
```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"],
  "Resource": "arn:aws:dynamodb:*:*:table/story-creator-sessions"
}
```

### Data Privacy

- User content is stored encrypted at rest (DynamoDB/S3 encryption)
- Temporary presigned URLs expire after 7 days
- Sessions auto-delete after 30 days (TTL)
- No user data sent to external services without consent

---

## Performance Considerations

### Latency Targets

- **Idea Generation**: 10-20 seconds (3 concepts)
- **Story Drafting**: 20-40 seconds (5 scenes)
- **Scene Rewrite**: 8-15 seconds
- **Voice Generation**: 15-60 seconds per scene
- **Image Generation**: 30-120 seconds per image

### Optimization Strategies

1. **Streaming**: Show agent thinking in real-time
2. **Parallel Generation**: Generate audio/images concurrently
3. **Background Jobs**: Long tasks run async with status polling
4. **Caching**: Cache narrator metadata, reuse prompts
5. **Batch Operations**: Generate all images in one batch request

---

## Observability

### Logging

- Structured logging with `structlog`
- Request IDs for tracing
- Agent invocation logs
- Error stack traces

### Metrics

- Session creation rate
- Stage completion times
- Agent success/failure rates
- External service latencies
- Cost per session

### Monitoring

- CloudWatch for AWS metrics
- Custom dashboards for business metrics
- Alerts for error rates, latency spikes

---

## Testing Strategy

### Unit Tests

- Test individual agent functions
- Mock external services
- Validate Pydantic models

### Integration Tests

- Test coordinator workflow
- Test API endpoints
- Test state persistence

### Load Tests

- Simulate concurrent users
- Test external service failures
- Validate rate limiting

See `docs/tests/` for detailed testing documentation.

---

## Future Enhancements

1. **Multi-language Support**: Generate stories in multiple languages
2. **Character Consistency**: Track character descriptions across scenes
3. **Style Transfer**: Apply specific author styles
4. **Collaborative Editing**: Multiple users on same story
5. **Version History**: Track draft iterations
6. **Export Formats**: EPUB, PDF, audiobook formats
7. **Social Features**: Share stories, public gallery
8. **Analytics**: Track user preferences, popular genres

---

## References

- [Strands Agents Documentation](https://strandsagents.com/latest/documentation/)
- [AWS Bedrock Models](https://docs.aws.amazon.com/bedrock/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)

