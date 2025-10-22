# API Documentation

## Table of Contents
- [Authentication](#authentication)
- [Story Text Generation API](#story-text-generation-api)
  - [Generate Story Outline](#1-generate-story-outline)
  - [Generate Complete Story](#2-generate-complete-story)
  - [Regenerate Story Segment](#3-regenerate-story-segment)
  - [Generate Topic Ideas](#4-generate-topic-ideas)
- [Story Image Generation API](#story-image-generation-api)
  - [Generate Story Images](#1-generate-story-images)
  - [Regenerate Segment Image](#2-regenerate-segment-image)
- [Error Responses](#error-responses)

---

## Authentication

All API endpoints require authentication using AWS Cognito. Include the ID token in the Authorization header:

```http
Authorization: Bearer <ID_TOKEN>
```

### Getting an ID Token

Use AWS Cognito to authenticate:

```bash
aws cognito-idp initiate-auth \
    --region us-east-1 \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id <CLIENT_ID> \
    --auth-parameters USERNAME=<email>,PASSWORD=<password> \
    --query 'AuthenticationResult.IdToken' \
    --output text
```

---

## Story Text Generation API

Base URL: `https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev`

### 1. Generate Story Outline

Generates a high-level story outline with story parts (beginning, middle, end) and sections.

**Endpoint:** `POST /generate-story-outline`

**Request Body:**
```json
{
  "genre": "string",
  "reading_level": "string",
  "tone": "string",
  "user_input_description": "string",
  "story_type": "visual | audio",
  "number_of_speakers": 1-4,
  "panels": 6,
  "audio_length": 5,
  "job_id": "string",
  "model_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `genre` | string | Yes | Story genre (e.g., "adventure", "mystery", "fantasy") |
| `reading_level` | string | Yes | Target reading level (e.g., "elementary", "middle school") |
| `tone` | string | Yes | Story tone (e.g., "lighthearted", "serious", "humorous") |
| `user_input_description` | string | Yes | User's story concept description |
| `story_type` | string | Yes | Type of story: "visual" or "audio" |
| `number_of_speakers` | integer | Yes | Number of speakers/characters (1-4) |
| `panels` | integer | Conditional | Required if `story_type` is "visual". Number of panels |
| `audio_length` | integer | Conditional | Required if `story_type` is "audio". Audio length in minutes |
| `job_id` | string | Yes | Unique identifier for this job |
| `model_id` | string | No | LLM model to use. Default: "bedrock/us.amazon.nova-pro-v1:0". Other options: "bedrock/us.openai.gpt-oss-120b-1:0", "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0" |

**Response (200 OK):**
```json
{
  "success": true,
  "route": "generate_story_outline_description",
  "result": {
    "speaker_names": ["Narrator", "Character1"],
    "story_parts": [
      {
        "story_part": "beginning",
        "story_part_summary": "string",
        "story_part_speakers": ["Narrator", "Character1"]
      },
      {
        "story_part": "middle",
        "story_part_summary": "string",
        "story_part_speakers": ["Narrator", "Character1"]
      },
      {
        "story_part": "end",
        "story_part_summary": "string",
        "story_part_speakers": ["Narrator", "Character1"]
      }
    ],
    "metadata": {
      "user_id": "string",
      "job_id": "string",
      "genre": "string",
      "reading_level": "string",
      "tone": "string",
      "story_type": "string",
      "number_of_speakers": 2,
      "panels": 6,
      "created_timestamp": "2025-10-01T19:00:00Z"
    }
  },
  "authenticated_user": {
    "email": "user@example.com",
    "sub": "user-id",
    "username": "username"
  },
  "request_id": "string"
}
```

**Example:**
```bash
curl -X POST https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev/generate-story-outline \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "genre": "adventure",
    "reading_level": "elementary",
    "tone": "lighthearted",
    "user_input_description": "A brave mouse discovers magical cheese",
    "story_type": "visual",
    "number_of_speakers": 2,
    "panels": 6,
    "job_id": "job-001",
    "model_id": "bedrock/us.amazon.nova-pro-v1:0"
  }'
```

---

### 2. Generate Complete Story

Generates a complete story with detailed segments based on an outline.

**Endpoint:** `POST /generate-story`

**Request Body:**
```json
{
  "genre": "string",
  "reading_level": "string",
  "tone": "string",
  "story_outline_description": [
    {
      "story_part": "string",
      "story_part_summary": "string",
      "story_part_speakers": ["string"]
    }
  ],
  "story_type": "visual | audio",
  "number_of_speakers": 1-4,
  "panels": 6,
  "audio_length": 5,
  "job_id": "string",
  "model_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `genre` | string | Yes | Story genre |
| `reading_level` | string | Yes | Target reading level |
| `tone` | string | Yes | Story tone |
| `story_outline_description` | array | Yes | Array of story part objects from outline generation. Use the `story_parts` array returned from `/generate-story-outline` |
| `story_type` | string | Yes | Type of story: "visual" or "audio" |
| `number_of_speakers` | integer | Yes | Number of speakers/characters (1-4) |
| `panels` | integer | Conditional | Required if `story_type` is "visual" |
| `audio_length` | integer | Conditional | Required if `story_type` is "audio" |
| `job_id` | string | Yes | Unique identifier for this job |
| `model_id` | string | No | LLM model to use. Default: "bedrock/us.amazon.nova-pro-v1:0". Other options: "bedrock/us.openai.gpt-oss-120b-1:0", "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0" |

**Response (200 OK):**

For **Visual Stories**:
```json
{
  "success": true,
  "route": "generate_entire_story",
  "result": {
    "story_parts": [
      {
        "story_part": "beginning",
        "sections": [
          {
            "section_num": 1,
            "segments": [
              {
                "segment_num": 1,
                "segment_content": "string",
                "speaker": "string"
              }
            ]
          }
        ]
      }
    ],
    "speaker_names": ["Narrator", "Character1"],
    "metadata": {
      "user_id": "string",
      "job_id": "string",
      "genre": "string",
      "reading_level": "string",
      "tone": "string",
      "story_type": "visual",
      "number_of_speakers": 2,
      "panels": 6,
      "created_timestamp": "2025-10-01T19:00:00Z"
    }
  },
  "authenticated_user": { },
  "request_id": "string"
}
```

For **Audio Stories**:
```json
{
  "success": true,
  "route": "generate_entire_story",
  "result": {
    "story_parts": [
      {
        "story_part": "beginning",
        "sections": [
          {
            "section_num": 1,
            "segments": [
              {
                "segment_num": 1,
                "segment_content": "string",
                "speaker": "string"
              }
            ]
          }
        ]
      },
      {
        "story_part": "middle",
        "sections": [ ]
      },
      {
        "story_part": "end",
        "sections": [ ]
      }
    ],
    "speaker_names": ["Narrator"],
    "metadata": {
      "user_id": "string",
      "job_id": "string",
      "genre": "string",
      "reading_level": "string",
      "tone": "string",
      "story_type": "audio",
      "number_of_speakers": 1,
      "audio_length": 5,
      "created_timestamp": "2025-10-01T19:00:00Z"
    }
  },
  "authenticated_user": { },
  "request_id": "string"
}
```

**Story Structure Notes:**
- **Visual Stories**: Number of sections equals number of panels. Each section can have multiple segments.
- **Audio Stories**: Has 3 main story parts (beginning, middle, end). Each part can have multiple sections, and each section can have multiple segments.
- **Segments**: Each segment has `segment_num` (sequential across entire story), `segment_content` (the text), and `speaker` (who is speaking).
- **Sections**: Each section has `section_num` (sequential across entire story) and `segments` array.
- **Note**: When passing outline data to this endpoint, use the `story_parts` array from the `/generate-story-outline` response as the `story_outline_description` parameter.

**Example:**
```bash
curl -X POST https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev/generate-story \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "genre": "adventure",
    "reading_level": "elementary",
    "tone": "lighthearted",
    "story_outline_description": [
      {
        "story_part": "beginning",
        "story_part_summary": "A brave mouse discovers magical cheese...",
        "story_part_speakers": ["Narrator", "Max"]
      },
      {
        "story_part": "middle",
        "story_part_summary": "Max uses his wishes to help friends...",
        "story_part_speakers": ["Narrator", "Max"]
      },
      {
        "story_part": "end",
        "story_part_summary": "Max learns the value of selflessness...",
        "story_part_speakers": ["Narrator", "Max"]
      }
    ],
    "story_type": "visual",
    "number_of_speakers": 2,
    "panels": 6,
    "job_id": "job-002",
    "model_id": "bedrock/us.amazon.nova-pro-v1:0"
  }'
```

---

### 3. Regenerate Story Segment

Regenerates a specific story segment based on user feedback.

**Endpoint:** `POST /regenerate-segment`

**Request Body:**
```json
{
  "user_id": "string",
  "job_id": "string",
  "user_request": "string",
  "original_story_segments": [],
  "original_story_segment_num": 3,
  "original_story_segment": {
    "segment_num": 3,
    "segment_content": "string",
    "speaker": "string"
  },
  "genre": "string",
  "reading_level": "string",
  "tone": "string",
  "story_type": "visual | audio",
  "number_of_speakers": 1-4,
  "panels": 6,
  "audio_length": 5,
  "model_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | User ID (auto-extracted from Cognito) |
| `job_id` | string | Yes | Unique identifier for this job |
| `user_request` | string | Yes | User's request for how to modify the segment |
| `original_story_segments` | array | Yes | Full array of all story segments for context |
| `original_story_segment_num` | integer | Yes | The segment number to regenerate |
| `original_story_segment` | object | Yes | The original segment object |
| `genre` | string | Yes | Story genre |
| `reading_level` | string | Yes | Target reading level |
| `tone` | string | Yes | Story tone |
| `story_type` | string | Yes | Type of story: "visual" or "audio" |
| `number_of_speakers` | integer | Yes | Number of speakers (1-4) |
| `panels` | integer | Conditional | Required if `story_type` is "visual" |
| `audio_length` | integer | Conditional | Required if `story_type` is "audio" |
| `model_id` | string | No | LLM model to use. Default: "bedrock/us.amazon.nova-pro-v1:0". Other options: "bedrock/us.openai.gpt-oss-120b-1:0", "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0" |

**Response (200 OK):**
```json
{
  "success": true,
  "route": "regenerate_story_segment",
  "result": {
    "new_story_segment": {
      "segment_num": 3,
      "segment_content": "string",
      "speaker": "string"
    },
    "metadata": {
      "user_id": "string",
      "job_id": "string",
      "user_request": "string",
      "original_story_segments": [],
      "original_story_segment_num": 3,
      "original_story_segment": {},
      "genre": "string",
      "reading_level": "string",
      "tone": "string",
      "story_type": "string",
      "number_of_speakers": 2,
      "panels": 6,
      "created_timestamp": "2025-10-01T19:00:00Z"
    }
  },
  "authenticated_user": { },
  "request_id": "string"
}
```

**Example:**
```bash
curl -X POST https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev/regenerate-segment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job-003",
    "user_request": "Make this more exciting with action",
    "original_story_segments": [...],
    "original_story_segment_num": 3,
    "original_story_segment": {...},
    "genre": "adventure",
    "reading_level": "elementary",
    "tone": "lighthearted",
    "story_type": "visual",
    "number_of_speakers": 2,
    "panels": 6,
    "model_id": "bedrock/us.amazon.nova-pro-v1:0"
  }'
```

---

### 4. Generate Topic Ideas

Generates story ideas and creative direction based on a genre and topic list.

**Endpoint:** `POST /generate-topics-ideas`

**Request Body:**
```json
{
  "genre": "fiction | non-fiction",
  "topics": "string",
  "model_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `genre` | string | Yes | Story genre: "fiction" or "non-fiction" |
| `topics` | string | Yes | Comma-separated list of topics or keywords |
| `model_id` | string | No | LLM model to use. Default: "bedrock/us.amazon.nova-pro-v1:0". Other options: "bedrock/us.openai.gpt-oss-120b-1:0", "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0" |

**Response (200 OK):**
```json
{
  "success": true,
  "route": "generate_topics_ideas",
  "result": {
    "subject_category": "string",
    "scope_coverage": "string",
    "structure": "string",
    "source_types": "string",
    "target_audience": "string",
    "tone": "string",
    "metadata": {
      "genre": "fiction",
      "topics": "space adventure, robots, friendship",
      "user_id": "string",
      "job_id": "string",
      "created_timestamp": "2025-10-10T19:00:00Z"
    }
  },
  "authenticated_user": {
    "email": "user@example.com",
    "sub": "user-id",
    "username": "username"
  },
  "request_id": "string"
}
```

**Example:**
```bash
curl -X POST https://a3aflxx1o2.execute-api.us-east-1.amazonaws.com/dev/generate-topics-ideas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "genre": "fiction",
    "topics": "space adventure, robots, friendship",
    "model_id": "bedrock/us.amazon.nova-pro-v1:0"
  }'
```

**Notes:**
- This endpoint helps brainstorm story concepts and creative direction
- For fiction: provides narrative structure, character ideas, and thematic elements
- For non-fiction: provides research direction, content structure, and audience targeting
- Use the generated ideas as input for the story outline endpoint

---

## Story Image Generation API

Base URL: `https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev`

### 1. Generate Story Images

Generates images for story segments using Google Gemini AI.

**Endpoint:** `POST /generate-story-image`

**Request Body:**
```json
{
  "story_segments": [
    {
      "story_segment_content": "string",
      "story_segment_number": 1,
      "story_segment_speaker": "string"
    }
  ],
  "art_style": "string",
  "number_of_panels": 3,
  "job_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `story_segments` | array | Yes | Array of story segment objects |
| `story_segments[].story_segment_content` | string | Yes | Text content of the segment |
| `story_segments[].story_segment_number` | integer | Yes | Segment number |
| `story_segments[].story_segment_speaker` | string | Yes | Speaker/narrator name |
| `art_style` | string | Yes | Desired art style (e.g., "whimsical watercolor illustration") |
| `number_of_panels` | integer | Yes | Number of images to generate |
| `job_id` | string | Yes | Unique identifier for this job |

**Response (200 OK):**
```json
{
  "success": true,
  "route": "generate_entire_story_image",
  "result": {
    "story_segments": [
      {
        "story_segment_content": "string",
        "story_segment_number": 1,
        "story_segment_speaker": "string",
        "image_s3_uri": "s3://story-42-story-images-dev/users/{user_id}/jobs/{job_id}/segment_1.png",
        "image_presigned_url": "https://story-42-story-images-dev.s3.us-east-1.amazonaws.com/users/{user_id}/jobs/{job_id}/segment_1.png?X-Amz-Algorithm=..."
      }
    ],
    "metadata": {
      "created_timestamp": "2025-10-01T19:00:00Z",
      "art_style": "string",
      "number_of_panels": 3,
      "user_id": "string",
      "job_id": "string"
    }
  },
  "authenticated_user": {
    "email": "user@example.com",
    "sub": "user-id",
    "username": "username"
  },
  "request_id": "string"
}
```

**S3 URL Structure:**
```
S3 URI: s3://story-42-story-images-dev/users/{user_id}/jobs/{job_id}/segment_{number}.png
Presigned URL: Valid for 1 hour, included in every image response
```

**Example:**
```bash
curl -X POST https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev/generate-story-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "story_segments": [
      {
        "story_segment_content": "A brave squirrel in a magical forest",
        "story_segment_number": 1,
        "story_segment_speaker": "Narrator"
      }
    ],
    "art_style": "whimsical watercolor illustration",
    "number_of_panels": 3,
    "job_id": "job-img-001"
  }'
```

**Notes:**
- Image generation takes approximately 30-60 seconds per image
- Images are saved as PNG format in S3
- User ID is automatically extracted from Cognito authentication
- Images are organized by user and job for easy retrieval
- Each response includes both `image_s3_uri` (permanent S3 location) and `image_presigned_url` (1-hour temporary URL)
- Use presigned URLs for immediate image display/download without additional AWS authentication
- Automatic validation ensures the number of generated images matches `number_of_panels` (retries up to 3 times)

---

### 2. Regenerate Segment Image

Regenerates a specific image based on the original image and user modifications.

**Endpoint:** `POST /regenerate-segment-image`

**Request Body:**
```json
{
  "user_request": "string",
  "original_segment_image_s3_uri": "string",
  "job_id": "string"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_request` | string | Yes | User's request for how to modify the image |
| `original_segment_image_s3_uri` | string | Yes | S3 URI of the original image to modify |
| `job_id` | string | Yes | Unique identifier for this job |

**Response (200 OK):**
```json
{
  "success": true,
  "route": "regenerate_segment_image",
  "result": {
    "new_story_segment_image_s3_uri": "s3://story-42-story-images-dev/users/{user_id}/jobs/{job_id}/segment_{num}_regenerated_{timestamp}.png",
    "new_story_segment_image_presigned_url": "https://story-42-story-images-dev.s3.us-east-1.amazonaws.com/users/{user_id}/jobs/{job_id}/segment_{num}_regenerated_{timestamp}.png?X-Amz-Algorithm=...",
    "metadata": {
      "user_request": "string",
      "original_segment_image_s3_uri": "string",
      "created_timestamp": "2025-10-01T19:00:00Z",
      "user_id": "string",
      "job_id": "string"
    }
  },
  "authenticated_user": {
    "email": "user@example.com",
    "sub": "user-id",
    "username": "username"
  },
  "request_id": "string"
}
```

**Example:**
```bash
curl -X POST https://6txczj8c6i.execute-api.us-east-1.amazonaws.com/dev/regenerate-segment-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "make the scene brighter and add more flowers",
    "original_segment_image_s3_uri": "s3://aws-hackathon-2025-story-images-dev/users/user-123/jobs/job-001/segment_1.png",
    "job_id": "job-img-002"
  }'
```

**Notes:**
- This endpoint loads the original image from S3 and uses it as context for regeneration
- The new image maintains the overall composition while applying requested changes
- Regenerated images include a timestamp in the filename to avoid conflicts
- Processing time: approximately 10-20 seconds
- Response includes both `new_story_segment_image_s3_uri` (permanent location) and `new_story_segment_image_presigned_url` (1-hour temporary URL)
- Use presigned URLs for immediate image display/download without additional AWS authentication

---

## Error Responses

All endpoints follow a consistent error response format:

### 400 Bad Request

Missing or invalid parameters:

```json
{
  "error": "Missing required parameters: genre, reading_level, tone"
}
```

### 401 Unauthorized

Missing or invalid authentication:

```json
{
  "message": "Unauthorized"
}
```

### 500 Internal Server Error

Server-side processing error:

```json
{
  "error": "Internal server error",
  "message": "Detailed error message",
  "request_id": "string"
}
```

### Common Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing required parameters` | Request body missing required fields | Check request body against parameter table |
| `Unauthorized` | Invalid or expired JWT token | Refresh authentication token |
| `panels is required when story_type is "visual"` | Missing conditional parameter | Include `panels` for visual stories |
| `audio_length is required when story_type is "audio"` | Missing conditional parameter | Include `audio_length` for audio stories |
| `number_of_speakers must be between 1 and 4` | Invalid speaker count | Use 1-4 speakers only |
| `genre must be either "fiction" or "non-fiction"` | Invalid genre for topic ideas | Use "fiction" or "non-fiction" |
| `No image generated in response` | Image generation failed | Retry request or check art style prompt |

---

## Rate Limits

- **Text Generation API**: Supports multiple LLM models via AWS Bedrock
  - Default: Amazon Nova Pro (`bedrock/us.amazon.nova-pro-v1:0`)
  - Also supports: OpenAI GPT OSS 120B (`bedrock/us.openai.gpt-oss-120b-1:0`), Claude 3.5 Sonnet (`bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0`)
  - Limited by AWS Bedrock quotas
  - Typical response time: 5-30 seconds per request

- **Image Generation API**: Uses Google Gemini 2.5 Flash
  - Subject to Google API quotas
  - Typical response time: 30-60 seconds per image
  - Generated images include presigned URLs valid for 1 hour

---

## Best Practices

1. **Job IDs**: Use unique, descriptive job IDs (e.g., `job-{timestamp}` or UUIDs)
2. **Error Handling**: Always check response status codes and handle errors gracefully
3. **Timeouts**: Set client timeouts to at least 90 seconds for image generation, 180 seconds for API Gateway
4. **Retries**: Implement exponential backoff for rate limit errors
5. **S3 URLs**: Store returned S3 URLs and presigned URLs for later access to generated images
6. **Presigned URLs**: Image responses include presigned URLs valid for 1 hour - cache them but refresh before expiration
7. **Segment Numbers**: Keep segment numbers sequential across the entire story
8. **Context**: Include full story context when regenerating segments for best results
9. **DynamoDB Tracking**: All story generation endpoints automatically track requests/responses to DynamoDB for analytics

---

## Examples

Complete workflow examples are available in:
- **Shell Scripts**:
  - `test_story_simple.sh` - Text generation workflow
  - `test_story_image.sh` - Image generation workflow
- **Jupyter Notebooks** (in `notebooks/` directory):
  - `test_complete_story_workflow_visual.ipynb` - Complete visual story workflow with image display
  - `test_complete_story_workflow_audio.ipynb` - Complete audio story workflow
  - `test_generate_topics_ideas.ipynb` - Topic ideas generation examples

---

## Support

For issues or questions:
- Check CloudWatch logs: `/aws/lambda/story-42-story-text-regen-dev` (Text generation)
- Check CloudWatch logs: `/aws/lambda/story-42-story-image-regen-dev` (Image generation)

### DynamoDB Tracking

All API requests and responses are automatically tracked in DynamoDB:
- **Table Name**: `story-42-story-sessions-dev`
- **Primary Key**: `user_id` (Hash), `session_id` (Range)
- **Attributes**: `timestamp`, `route`, `request`, `response`, `created_at`
- **GSI**: `TimestampIndex` on `user_id` and `timestamp` for chronological queries
- **GSI**: `RouteTimestampIndex` on `route` and `timestamp` for route-specific queries

### S3 Bucket

Story images and assets are stored in:
- **Bucket Name**: `story-42-story-images-dev`
- **Path Structure**: `users/{user_id}/jobs/{job_id}/segment_{num}.png`
- **Access**: Images include presigned URLs in API responses for direct download

---

**Last Updated:** October 14, 2025
**API Version:** 1.2

### Changelog

**v1.2 (October 14, 2025):**
- Removed standalone data operations endpoints (`/write-ddb`, `/query-ddb`, `/read-from-s3`)
- All story generation endpoints now automatically track requests/responses to DynamoDB
- Image generation endpoints now include presigned URLs (1-hour validity) in responses
- Added automatic panel count and speaker count validation with retry logic

