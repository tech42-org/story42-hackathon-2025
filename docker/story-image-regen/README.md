# Story Image Regeneration Lambda

This Lambda function generates images for story segments using Google's Gemini 2.5 Flash Image Preview model.

## Features

- **Generate Entire Story Images**: Creates images for all story segments at once
- **Regenerate Segment Image**: Regenerates a specific story segment image based on user feedback
- Images stored in S3 for persistence
- Supports custom art styles

## Routes

### 1. `/generate-story-images` (POST)

Generates images for all story segments.

**Request Body:**
```json
{
  "story_segments": [
    {
      "story_segment_content": "Once upon a time...",
      "story_segment_number": 1,
      "story_segment_speaker": "Narrator"
    }
  ],
  "art_style": "watercolor",
  "number_of_panels": 3,
  "job_id": "unique-job-identifier-123"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "story_segments": [
      {
        "story_segment_content": "Once upon a time...",
        "story_segment_number": 1,
        "story_segment_speaker": "Narrator",
        "image_s3_url": "s3://bucket/path/segment_1.png"
      }
    ],
    "metadata": {
      "created_timestamp": "2025-09-30T20:00:00+00:00",
      "art_style": "watercolor",
      "number_of_panels": 3,
      "user_id": "3488e408-5061-702b-2c5d-83be4c54f069",
      "job_id": "unique-job-identifier-123"
    }
  }
}
```

### 2. `/regenerate-segment-image` (POST)

Regenerates a specific story segment image.

**Request Body:**
```json
{
  "user_request": "Make the mouse look braver",
  "story_segments": [...],
  "story_segment_target": 2,
  "original_segment_image_s3_uri": "s3://bucket/path/segment_2.png",
  "job_id": "unique-job-identifier-123"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "new_story_segment_image": "s3://bucket/path/segment_2_regenerated.png",
    "story_segment_number": 2,
    "story_segment_speaker": "Narrator",
    "metadata": {
      "user_request": "Make the mouse look braver",
      "original_segment_image_s3_uri": "s3://bucket/path/segment_2.png",
      "created_timestamp": "2025-09-30T20:00:00+00:00",
      "user_id": "3488e408-5061-702b-2c5d-83be4c54f069",
      "job_id": "unique-job-identifier-123"
    }
  }
}
```

## Environment Variables

- `GOOGLE_API_KEY`: Google AI API key for Gemini
- `S3_BUCKET`: S3 bucket name for storing images (default: `aws-hackathon-2025-story-images`)

## Dependencies

- `google-genai==1.0.0`: Google Generative AI SDK
- `boto3==1.34.0`: AWS SDK for S3 operations
- `pillow==10.4.0`: Image processing library

## Building and Deploying

```bash
cd docker/story-image-regen
./build.sh
```

This will:
1. Build the Docker image for Lambda
2. Tag it appropriately
3. Push to ECR

## IAM Permissions Required

- `s3:PutObject`: To save images to S3
- `s3:GetObject`: To retrieve original images
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`: For CloudWatch logging

