# Backend Requirements

This document outlines the backend API requirements for Story42 to replace the current mock data implementation with real AWS Bedrock integration.

## Overview

The backend should handle:
1. AWS credentials securely (never expose in frontend)
2. Story generation via AWS Bedrock (Claude v2)
3. Voice synthesis via AWS Polly
4. Real-time progress updates via WebSocket or Server-Sent Events
5. Audio file processing and storage

## Required Endpoints

### 1. Story Generation

**POST** `/api/generate-story`

Request body:
```json
{
  "topic": "The Lost City of Atlantis",
  "genre": "fiction",
  "length": "medium",
  "tone": "Mysterious and adventurous",
  "targetAudience": "Young adults",
  "voiceId": "narrator-classic"
}
```

Response (streaming via WebSocket or SSE):
```json
{
  "type": "progress",
  "data": {
    "progress": 25,
    "message": "Writing Agent creating Chapter 1...",
    "agent": "writer",
    "activity": "Chapter 1: Drafting opening scene (485 words)",
    "chapter": 1
  }
}
```

Final response:
```json
{
  "type": "complete",
  "data": {
    "story": {
      "title": "The Lost City of Atlantis",
      "chapters": [
        {
          "id": "chapter-1",
          "number": 1,
          "title": "The Discovery",
          "content": "Full markdown content...",
          "wordCount": 485,
          "duration": "3:14",
          "timestamp": "2025-10-01T10:30:00Z"
        }
      ],
      "metadata": {
        "genre": "fiction",
        "length": "medium",
        "tone": "Mysterious and adventurous",
        "targetAudience": "Young adults",
        "wordCount": 2500,
        "estimatedDuration": "15:32",
        "generatedAt": "2025-10-01T10:30:00Z"
      }
    },
    "audioUrl": "https://s3.amazonaws.com/story42/audio/story-123.mp3"
  }
}
```

### 2. Voice Preview

**GET** `/api/voices`

Response:
```json
{
  "voices": [
    {
      "id": "narrator-classic",
      "name": "Classic Narrator",
      "description": "A deep, authoritative voice perfect for storytelling",
      "accent": "British",
      "gender": "Male",
      "previewUrl": "https://s3.amazonaws.com/story42/previews/narrator-classic.mp3",
      "pollyVoiceId": "Brian"
    }
  ]
}
```

### 3. Custom Voice Upload

**POST** `/api/upload-voice`

Request (multipart/form-data):
- `audio`: Audio file (MP3, WAV, or M4A)
- `name`: Voice name
- `userId`: User identifier

Response:
```json
{
  "voiceId": "custom-abc123",
  "name": "My Custom Voice",
  "previewUrl": "https://s3.amazonaws.com/story42/custom-voices/abc123.mp3",
  "status": "ready"
}
```

## AWS Services Required

### 1. AWS Bedrock
- **Model**: `anthropic.claude-v2` or `anthropic.claude-v2:1`
- **Region**: `us-east-1` (or where Bedrock is available)
- **Permissions**: `bedrock:InvokeModel`

Example invocation:
```javascript
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

const prompt = `Generate a ${length} ${genre} story about ${topic}...`;

const command = new InvokeModelCommand({
  modelId: "anthropic.claude-v2",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
    max_tokens_to_sample: 4096,
    temperature: 0.7,
    top_p: 0.9
  })
});

const response = await client.send(command);
const data = JSON.parse(new TextDecoder().decode(response.body));
```

### 2. AWS Polly
- **Voice Type**: Neural voices for better quality
- **Output Format**: MP3 (48 kbps or higher)
- **Permissions**: `polly:SynthesizeSpeech`

Recommended voices:
- Matthew (Male, US English)
- Joanna (Female, US English)
- Brian (Male, British English)
- Amy (Female, British English)
- Aria (Female, New Zealand English)

Example synthesis:
```javascript
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const pollyClient = new PollyClient({ region: "us-east-1" });

const command = new SynthesizeSpeechCommand({
  Text: chapterContent,
  OutputFormat: "mp3",
  VoiceId: "Matthew",
  Engine: "neural",
  SampleRate: "24000"
});

const response = await pollyClient.send(command);
const audioStream = response.AudioStream;
```

### 3. Amazon S3
- **Purpose**: Store generated audio files and custom voice uploads
- **Permissions**:
  - `s3:PutObject` (upload)
  - `s3:GetObject` (download/stream)
  - `s3:DeleteObject` (cleanup)

Recommended bucket structure:
```
story42-bucket/
├── audio/
│   ├── story-{id}.mp3
│   └── ...
├── previews/
│   ├── narrator-classic.mp3
│   └── ...
└── custom-voices/
    ├── {userId}/
    │   ├── voice-{id}.mp3
    │   └── ...
```

## Backend Architecture Options

### Option 1: Express.js + WebSocket
```
Frontend → Express API → AWS Bedrock
           ↓ WebSocket
        Real-time updates
```

### Option 2: AWS Lambda + API Gateway + WebSocket API
```
Frontend → API Gateway → Lambda → Bedrock
           ↓ WebSocket API
        Real-time updates via Lambda
```

### Option 3: Next.js API Routes + SSE
```
Frontend → Next.js API → AWS Bedrock
           ↓ Server-Sent Events
        Real-time streaming updates
```

## Environment Variables

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# S3 Bucket
S3_BUCKET_NAME=story42-bucket

# API Configuration
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Optional: Rate limiting
MAX_REQUESTS_PER_HOUR=10
```

## Security Considerations

1. **Never expose AWS credentials in frontend code**
2. **Implement rate limiting** to prevent abuse
3. **Validate all user inputs** before sending to AWS
4. **Use pre-signed URLs** for S3 downloads
5. **Implement authentication** (AWS Cognito recommended)
6. **Set up CORS** properly for production
7. **Sanitize file uploads** (check file types, sizes, scan for malware)
8. **Set S3 bucket policies** to restrict public access

## Cost Considerations

### AWS Bedrock Pricing (Claude v2)
- **Input**: ~$0.008 per 1K tokens
- **Output**: ~$0.024 per 1K tokens
- Medium story (~3000 words) ≈ $0.30-0.50 per generation

### AWS Polly Pricing
- **Neural voices**: $16 per 1M characters
- Medium story (~15,000 characters) ≈ $0.24 per audiobook

### AWS S3 Pricing
- **Storage**: $0.023 per GB/month
- **Data transfer**: $0.09 per GB (first 10 TB)
- Typical audio file (5-10 MB) ≈ $0.001 per month storage

**Total per audiobook**: ~$0.50-1.00

## Implementation Checklist

- [ ] Set up AWS credentials with proper IAM roles
- [ ] Create S3 bucket with appropriate policies
- [ ] Implement story generation endpoint with Bedrock
- [ ] Add real-time progress tracking (WebSocket/SSE)
- [ ] Integrate AWS Polly for audio synthesis
- [ ] Implement audio file storage and retrieval
- [ ] Add custom voice upload functionality
- [ ] Set up rate limiting and authentication
- [ ] Add error handling and logging
- [ ] Test with different story lengths and genres
- [ ] Deploy to production environment
- [ ] Set up monitoring and alerts

## Testing the Integration

Replace mock in `src/services/bedrockService.js`:

```javascript
// Current mock implementation
export const streamStoryGeneration = async (params, onProgress) => {
  // Mock simulation...
};

// Replace with real API call
export const streamStoryGeneration = async (params, onProgress) => {
  const ws = new WebSocket('ws://localhost:3001/api/generate-story');

  ws.onopen = () => {
    ws.send(JSON.stringify(params));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'progress') {
      onProgress(data.data);
    } else if (data.type === 'complete') {
      return data.data.story;
    }
  };
};
```

## Support

For AWS setup issues, refer to:
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Polly Documentation](https://docs.aws.amazon.com/polly/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
