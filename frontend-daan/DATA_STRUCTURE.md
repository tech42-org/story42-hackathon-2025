# Data Structure Documentation

This document defines the data structures used throughout the application for easy API integration.

## 📥 Input Parameters

### Story Generation Request

```typescript
interface StoryGenerationParams {
  topic: string;              // Story title/topic
  genre: 'fiction' | 'non-fiction' | 'childrens' | 'documentary';
  length: 'short' | 'medium' | 'long';
  tone: string;               // e.g., "Suspenseful and mysterious"
  targetAudience: string;     // e.g., "Young adults", "Children ages 8-12"
}
```

**Example:**
```json
{
  "topic": "The Lost City of Atlantis",
  "genre": "fiction",
  "length": "medium",
  "tone": "Mysterious and adventurous",
  "targetAudience": "Young adults"
}
```

## 📤 Output Data Structures

### Generated Story Response

```typescript
interface GeneratedStory {
  title: string;
  chapters: Chapter[];
  metadata: StoryMetadata;
}

interface Chapter {
  id: string;                 // e.g., "chapter-1"
  number: number;             // Chapter number (1-based)
  title: string;              // Chapter title
  content: string;            // Full chapter text content (markdown supported)
  wordCount: number;          // Word count for this chapter
  duration: string;           // Estimated audio duration (e.g., "3:20")
  timestamp: string;          // ISO 8601 timestamp
}

interface StoryMetadata {
  genre: string;
  length: string;
  tone: string;
  targetAudience: string;
  wordCount: number;          // Total word count
  estimatedDuration: string;  // Total audio duration (e.g., "15:32")
  generatedAt: string;        // ISO 8601 timestamp
}
```

**Example Response:**
```json
{
  "title": "The Lost City of Atlantis",
  "chapters": [
    {
      "id": "chapter-1",
      "number": 1,
      "title": "The Beginning",
      "content": "# The Beginning\n\nThe ancient maps spoke of a city beneath the waves...",
      "wordCount": 485,
      "duration": "3:14",
      "timestamp": "2025-10-01T10:30:00.000Z"
    },
    {
      "id": "chapter-2",
      "number": 2,
      "title": "An Unexpected Turn",
      "content": "# An Unexpected Turn\n\nDr. Sarah Chen examined the artifact...",
      "wordCount": 512,
      "duration": "3:25",
      "timestamp": "2025-10-01T10:30:15.000Z"
    }
  ],
  "metadata": {
    "genre": "fiction",
    "length": "medium",
    "tone": "Mysterious and adventurous",
    "targetAudience": "Young adults",
    "wordCount": 2500,
    "estimatedDuration": "15:32",
    "generatedAt": "2025-10-01T10:30:00.000Z"
  }
}
```

## 🔄 Progress Updates

### Generation Progress Event

```typescript
interface ProgressUpdate {
  progress: number;           // 0-100
  message: string;            // Human-readable status
  agent?: AgentType;          // Which agent is active
  activity?: string;          // Detailed activity description
  chapter?: number;           // Current chapter being processed
}

type AgentType =
  | 'system'      // System-level operations
  | 'research'    // Research agent analyzing topic
  | 'planning'    // Planning agent creating structure
  | 'writer'      // Writing agent creating content
  | 'editor'      // Editor agent reviewing content
  | 'voice'       // Voice agent preparing narration
  | 'audio';      // Audio engineer processing audio
```

**Example Progress Events:**
```json
[
  {
    "progress": 5,
    "message": "Research Agent analyzing topic...",
    "agent": "research",
    "activity": "Analyzing \"The Lost City of Atlantis\" for fiction genre"
  },
  {
    "progress": 25,
    "message": "Writing Agent creating Chapter 1...",
    "agent": "writer",
    "activity": "Chapter 1: Drafting opening scene",
    "chapter": 1
  },
  {
    "progress": 90,
    "message": "Voice Agent synthesizing Chapter 1...",
    "agent": "voice",
    "activity": "Converting text to speech"
  }
]
```

## 🎵 Audio Generation

### Audio Request

```typescript
interface AudioGenerationRequest {
  text: string;               // Text to convert to speech
  voiceId?: string;           // Voice ID (e.g., "Matthew", "Joanna")
  engine?: 'standard' | 'neural';
  language?: string;          // e.g., "en-US"
}
```

### Audio Response

```typescript
interface AudioResponse {
  audioUrl: string;           // URL or base64 data URL
  duration: string;           // Audio duration (e.g., "3:20")
  format: string;             // e.g., "mp3", "wav"
  sizeBytes: number;          // File size in bytes
}
```

**Example:**
```json
{
  "audioUrl": "https://s3.amazonaws.com/bucket/audiobook-12345.mp3",
  "duration": "15:32",
  "format": "mp3",
  "sizeBytes": 15728640
}
```

## 🎯 Complete Audiobook Response

### Full Audiobook with Audio

```typescript
interface AudiobookResponse {
  story: GeneratedStory;
  audio: {
    fullAudioUrl: string;     // Complete audiobook MP3
    chapterAudio: ChapterAudio[];
    metadata: AudioMetadata;
  };
}

interface ChapterAudio {
  chapterId: string;
  audioUrl: string;
  duration: string;
}

interface AudioMetadata {
  totalDuration: string;
  format: string;
  bitrate: string;            // e.g., "128kbps"
  sampleRate: number;         // e.g., 44100
  voiceId: string;
}
```

**Example:**
```json
{
  "story": {
    "title": "The Lost City of Atlantis",
    "chapters": [...],
    "metadata": {...}
  },
  "audio": {
    "fullAudioUrl": "https://s3.amazonaws.com/bucket/audiobook-12345.mp3",
    "chapterAudio": [
      {
        "chapterId": "chapter-1",
        "audioUrl": "https://s3.amazonaws.com/bucket/ch1-12345.mp3",
        "duration": "3:14"
      }
    ],
    "metadata": {
      "totalDuration": "15:32",
      "format": "mp3",
      "bitrate": "128kbps",
      "sampleRate": 44100,
      "voiceId": "Matthew"
    }
  }
}
```

## 🔌 API Integration Points

### 1. Start Story Generation

```typescript
// POST /api/generate-story
const response = await fetch('/api/generate-story', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: "The Lost City of Atlantis",
    genre: "fiction",
    length: "medium",
    tone: "Mysterious and adventurous",
    targetAudience: "Young adults"
  })
});

const data = await response.json();
// Returns: GeneratedStory
```

### 2. Stream Progress Updates (WebSocket)

```typescript
const ws = new WebSocket('wss://api.example.com/generate-stream');

ws.send(JSON.stringify({
  type: 'generate',
  params: { topic, genre, length, tone, targetAudience }
}));

ws.onmessage = (event) => {
  const update: ProgressUpdate = JSON.parse(event.data);
  console.log(`${update.progress}%: ${update.message}`);
};
```

### 3. Generate Audio

```typescript
// POST /api/generate-audio
const response = await fetch('/api/generate-audio', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: chapterContent,
    voiceId: "Matthew",
    engine: "neural"
  })
});

const audio = await response.json();
// Returns: AudioResponse
```

## 📊 Frontend Integration

### Using the Bedrock Service

```javascript
import { streamStoryGeneration } from './services/bedrockService';

// Generate story with progress tracking
const story = await streamStoryGeneration(
  formData,
  (progressUpdate) => {
    // Update progress bar
    setProgress(progressUpdate.progress);
    setMessage(progressUpdate.message);
  },
  (agentActivity) => {
    // Update agent activity log
    if (agentActivity.activity) {
      addActivity({
        agent: agentActivity.agent,
        activity: agentActivity.activity,
        chapter: agentActivity.chapter
      });
    }
  }
);

console.log('Story generated:', story);
```

## 🎨 Agent Activity Display

Each agent has a specific role and color coding:

| Agent | Icon | Color | Purpose |
|-------|------|-------|---------|
| system | ⚙️ | Slate | System operations |
| research | 🔍 | Blue | Topic analysis |
| planning | 📋 | Purple | Structure creation |
| writer | ✍️ | Green | Content generation |
| editor | ✏️ | Orange | Content review |
| voice | 🎙️ | Pink | Voice synthesis |
| audio | 🎵 | Cyan | Audio processing |

## 🔐 Error Handling

```typescript
interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
}

// Example errors
{
  "error": "Story generation failed",
  "code": "GENERATION_ERROR",
  "details": {
    "reason": "AWS Bedrock quota exceeded"
  }
}
```

## 📝 Notes for Integration

1. **AWS Bedrock**: Replace mock data in `bedrockService.js` with real API calls
2. **Streaming**: Use WebSocket or Server-Sent Events for real-time progress
3. **Audio**: AWS Polly can handle up to 3000 characters per request - chunk longer content
4. **Caching**: Consider caching generated stories to reduce API costs
5. **Rate Limiting**: Implement rate limiting to prevent abuse

---

This structure is ready for production use with AWS Bedrock and Polly APIs.
