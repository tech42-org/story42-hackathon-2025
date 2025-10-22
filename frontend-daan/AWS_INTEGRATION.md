# AWS Bedrock Integration Guide

## Overview
This application uses AWS Bedrock for AI-powered story generation and audio synthesis. The integration is designed for the hackathon demo.

## Architecture

### Story Generation Flow
1. **User Input** → Story parameters (topic, genre, tone, audience)
2. **AWS Bedrock** → Generate complete story content
3. **AWS Polly/Bedrock** → Synthesize audio narration
4. **Download** → Provide MP3 audiobook to user

## Implementation Steps

### 1. AWS Bedrock Setup

```javascript
// src/services/bedrockService.js

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
  }
});

export const generateStoryWithBedrock = async (params) => {
  const { topic, genre, tone, targetAudience, length } = params;

  const prompt = `Create a ${genre} story titled "${topic}" with a ${tone} tone for ${targetAudience}.
  The story should be approximately ${getWordCount(length)} words.

  Format the output as JSON with the following structure:
  {
    "title": "story title",
    "chapters": [
      {
        "number": 1,
        "title": "chapter title",
        "content": "chapter content"
      }
    ]
  }`;

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
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return JSON.parse(responseBody.completion);
};
```

### 2. Audio Generation with AWS Polly

```javascript
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const pollyClient = new PollyClient({
  region: process.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
  }
});

export const generateAudioWithPolly = async (text, voiceId = 'Matthew') => {
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: voiceId,
    Engine: 'neural'
  });

  const response = await pollyClient.send(command);

  // Convert audio stream to blob
  const audioBlob = await response.AudioStream.transformToByteArray();
  const blob = new Blob([audioBlob], { type: 'audio/mpeg' });

  return URL.createObjectURL(blob);
};
```

### 3. Environment Variables

Create a `.env` file:

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_access_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 4. Required AWS Permissions

Your IAM user needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "polly:SynthesizeSpeech"
      ],
      "Resource": "*"
    }
  ]
}
```

## Backend Implementation (Recommended)

For production, implement a backend API to handle AWS credentials securely:

```javascript
// Backend API endpoint
app.post('/api/generate-story', async (req, res) => {
  const { topic, genre, tone, targetAudience, length } = req.body;

  try {
    // Generate story with Bedrock
    const story = await generateStoryWithBedrock(req.body);

    // Generate audio for each chapter
    const audioUrls = await Promise.all(
      story.chapters.map(chapter =>
        generateAudioWithPolly(chapter.content)
      )
    );

    // Combine audio files
    const finalAudio = await combineAudioFiles(audioUrls);

    res.json({
      story,
      audioUrl: finalAudio
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Models Available

### Text Generation
- `anthropic.claude-v2` - Best for creative writing
- `anthropic.claude-instant-v1` - Faster, good for shorter content
- `amazon.titan-text-express-v1` - Cost-effective option

### Voice Options (AWS Polly)
- **Matthew** - Male, US English, Neural
- **Joanna** - Female, US English, Neural
- **Ruth** - Female, US English, Neural (Documentary style)
- **Stephen** - Male, US English, Neural (British)

## Cost Estimates

### AWS Bedrock (Claude v2)
- $0.01102 per 1K input tokens
- $0.03268 per 1K output tokens
- Estimated: $0.10-0.50 per story

### AWS Polly (Neural voices)
- $16.00 per 1M characters
- Estimated: $0.04-0.08 per audiobook

## Demo Mode

Currently, the app runs in demo mode with mock data. To enable real AWS integration:

1. Install AWS SDK: `npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-polly`
2. Add environment variables
3. Replace mock functions in `bedrockService.js` with real AWS calls
4. Deploy backend API for credential security

## Testing

```bash
# Test story generation
curl -X POST http://localhost:3000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "A space adventure",
    "genre": "fiction",
    "tone": "exciting",
    "targetAudience": "young adults",
    "length": "medium"
  }'
```

## Next Steps for Hackathon

1. ✅ Create beautiful UI (Done)
2. ✅ Implement mock service layer (Done)
3. 🔄 Add AWS SDK packages
4. 🔄 Implement real Bedrock integration
5. 🔄 Add audio generation
6. 🔄 Implement download functionality
7. 🔄 Deploy to AWS Amplify or similar

## Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Polly Documentation](https://docs.aws.amazon.com/polly/)
- [Bedrock Model IDs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)
