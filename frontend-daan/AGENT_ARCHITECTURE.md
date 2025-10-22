# Agent Architecture - Story42

This document outlines the multi-agent system architecture for Story42's AI-powered story generation.

## Overview

Story42 uses a multi-agent workflow where specialized AI agents collaborate to create high-quality audiobooks. Each agent has a specific role in the generation pipeline, similar to how a real publishing team works together.

## Agent Roles

### 1. Research Agent 🔍
**Purpose**: Analyze the topic and gather contextual information

**Responsibilities**:
- Parse user input (topic, genre, audience)
- Research relevant themes and story elements
- Identify key plot points and character archetypes
- Gather contextual information (historical facts, scientific concepts, etc.)
- Provide thematic foundation for the story

**Input**:
```json
{
  "topic": "The Lost City of Atlantis",
  "genre": "fiction",
  "targetAudience": "Young adults",
  "tone": "Mysterious and adventurous"
}
```

**Output**:
```json
{
  "themes": ["exploration", "ancient mysteries", "discovery"],
  "plotElements": ["underwater expedition", "ancient artifacts", "hidden civilization"],
  "characterArchetypes": ["brave explorer", "wise mentor", "mysterious guardian"],
  "researchNotes": "Atlantis references from Plato's dialogues...",
  "keyPoints": [
    "Advanced civilization lost to the sea",
    "Mythical technology and knowledge",
    "Moral lessons about hubris"
  ]
}
```

**AWS Bedrock Prompt**:
```
You are a Research Agent for a story generation system. Analyze the following story request and provide:
1. Key themes (3-5)
2. Essential plot elements (5-7)
3. Character archetypes needed
4. Historical/scientific context (if applicable)
5. Story hooks and compelling angles

Topic: {topic}
Genre: {genre}
Target Audience: {targetAudience}
Tone: {tone}

Provide your research in JSON format.
```

### 2. Planning Agent 📋
**Purpose**: Create the story structure and chapter outline

**Responsibilities**:
- Design story arc (beginning, rising action, climax, resolution)
- Create chapter breakdown with titles
- Plan narrative pacing
- Define character development trajectory
- Ensure genre conventions are met

**Input**:
- Research Agent's output
- Story length parameter (short/medium/long)

**Output**:
```json
{
  "storyArc": {
    "setup": "Chapters 1-2",
    "risingAction": "Chapters 3-4",
    "climax": "Chapter 5",
    "resolution": "Chapter 6"
  },
  "chapters": [
    {
      "number": 1,
      "title": "The Discovery",
      "purpose": "Introduce protagonist and initial mystery",
      "wordCountTarget": 500,
      "keyEvents": ["Find ancient map", "Meet mentor character"]
    }
  ],
  "narrativeStyle": "Third-person limited perspective",
  "pacing": "Fast-paced with cliffhangers"
}
```

**AWS Bedrock Prompt**:
```
You are a Story Planning Agent. Based on the research provided, create a detailed story structure.

Research Summary: {researchOutput}
Story Length: {length} (short=3 chapters, medium=5 chapters, long=8 chapters)

Create:
1. Story arc with act breaks
2. Chapter-by-chapter outline with titles
3. Narrative pacing strategy
4. Character development plan
5. Target word count per chapter

Output in JSON format.
```

### 3. Writing Agent ✍️
**Purpose**: Draft the actual story content

**Responsibilities**:
- Write engaging narrative prose
- Develop characters and dialogue
- Create vivid descriptions and scenes
- Follow the chapter outline from Planning Agent
- Maintain consistent voice and style
- Ensure smooth chapter-to-chapter flow

**Input**:
- Planning Agent's chapter outline
- Current chapter number
- Previous chapter summary (for continuity)

**Output**:
```json
{
  "chapterNumber": 1,
  "title": "The Discovery",
  "content": "The ancient map lay spread across Dr. Elena Chen's desk...",
  "wordCount": 485,
  "characterDevelopment": ["Elena's curiosity established", "Tension with colleagues"],
  "plotProgression": ["Map discovered", "Expedition proposed"],
  "cliffhanger": "The map's coordinates pointed to an impossible location."
}
```

**AWS Bedrock Prompt**:
```
You are a Creative Writing Agent specializing in {genre} stories for {targetAudience}.

Write Chapter {chapterNumber}: {chapterTitle}

Chapter Brief: {chapterPurpose}
Target Word Count: {wordCountTarget}
Key Events to Include: {keyEvents}
Tone: {tone}

Previous Chapter Summary: {previousChapterSummary}

Write engaging, vivid prose that:
- Hooks the reader immediately
- Develops characters naturally
- Includes sensory details
- Maintains appropriate pacing
- Ends with intrigue for the next chapter

Output the chapter content in markdown format.
```

### 4. Editor Agent ✏️
**Purpose**: Review, polish, and enhance the written content

**Responsibilities**:
- Review grammar, spelling, and punctuation
- Enhance prose quality and readability
- Ensure narrative consistency
- Check pacing and flow
- Strengthen weak sections
- Verify tone and style consistency
- Add transitions between chapters

**Input**:
- Writing Agent's draft chapters
- Full story context

**Output**:
```json
{
  "chapterNumber": 1,
  "edits": [
    {
      "type": "enhancement",
      "location": "paragraph 3",
      "before": "The map was old.",
      "after": "The map bore the weight of centuries, its edges crumbling like ancient parchment.",
      "reason": "More vivid description"
    }
  ],
  "polishedContent": "The ancient map lay spread across Dr. Elena Chen's desk...",
  "qualityScore": 8.5,
  "suggestions": ["Consider adding more sensory details in opening scene"]
}
```

**AWS Bedrock Prompt**:
```
You are an Editor Agent specializing in {genre} literature.

Review and polish the following chapter:

{chapterContent}

Tasks:
1. Fix any grammar, spelling, or punctuation errors
2. Enhance prose quality (vivid language, sensory details)
3. Improve pacing and flow
4. Strengthen weak sections
5. Ensure consistency with tone: {tone}
6. Add smooth transitions

Provide:
- Polished version of the content
- List of major edits made
- Quality assessment (1-10)
- Suggestions for further improvement

Output in JSON format.
```

### 5. Voice Agent 🎙️
**Purpose**: Prepare content for audio narration

**Responsibilities**:
- Optimize text for spoken performance
- Add pronunciation guides for unusual words
- Insert natural pauses and pacing markers
- Format dialogue for voice differentiation
- Prepare SSML (Speech Synthesis Markup Language) tags
- Select appropriate voice parameters (pitch, rate, volume)

**Input**:
- Polished story content
- Selected voice ID
- Genre and tone

**Output**:
```json
{
  "ssmlContent": "<speak><prosody rate='medium'><p>The ancient map lay spread...</p></prosody></speak>",
  "pronunciationGuide": {
    "Atlantis": "at-LAN-tis",
    "Elena": "eh-LAY-nah"
  },
  "voiceParameters": {
    "voiceId": "Matthew",
    "engine": "neural",
    "rate": "medium",
    "pitch": "+0%",
    "volume": "+0dB"
  },
  "estimatedDuration": "3:14",
  "chapterMarkers": [
    { "time": "0:00", "label": "Chapter 1: The Discovery" }
  ]
}
```

**AWS Bedrock Prompt**:
```
You are a Voice Production Agent preparing text for audio narration.

Content: {chapterContent}
Voice Type: {voiceId} ({voiceDescription})
Genre: {genre}

Tasks:
1. Optimize text for spoken performance (remove awkward phrasings)
2. Add pronunciation notes for complex words
3. Suggest pacing (where to add pauses for dramatic effect)
4. Format dialogue for natural voice acting
5. Create SSML markup for AWS Polly
6. Estimate reading duration

Output preparation notes and SSML in JSON format.
```

### 6. Audio Engineer Agent 🎵
**Purpose**: Process and optimize the generated audio

**Responsibilities**:
- Combine chapter audio files
- Normalize audio levels
- Add fade-in/fade-out effects
- Insert chapter transitions
- Optimize file size while maintaining quality
- Add metadata (ID3 tags for MP3)
- Generate preview clips

**Input**:
- Raw audio files from AWS Polly
- Chapter information
- Story metadata

**Output**:
```json
{
  "audioFiles": [
    {
      "chapterId": "chapter-1",
      "url": "s3://bucket/audio/story-123-ch1.mp3",
      "duration": "3:14",
      "fileSize": "3.2 MB",
      "format": "MP3",
      "bitrate": "128 kbps",
      "sampleRate": "24000 Hz"
    }
  ],
  "masterFile": {
    "url": "s3://bucket/audio/story-123-complete.mp3",
    "duration": "15:32",
    "fileSize": "15.8 MB",
    "chapters": 5,
    "metadata": {
      "title": "The Lost City of Atlantis",
      "author": "Story42 AI",
      "album": "AI Generated Audiobooks",
      "genre": "Fiction",
      "year": "2025"
    }
  },
  "previewClip": {
    "url": "s3://bucket/audio/story-123-preview.mp3",
    "duration": "0:30",
    "description": "First 30 seconds"
  }
}
```

**Processing Steps**:
```javascript
// Pseudo-code for audio processing
async function processAudio(chapters, metadata) {
  const processedChapters = [];

  for (const chapter of chapters) {
    // Normalize audio levels
    const normalized = await normalizeAudio(chapter.rawAudio);

    // Add fade effects
    const withFades = await addFadeEffects(normalized, {
      fadeIn: 1000,  // 1 second
      fadeOut: 1500  // 1.5 seconds
    });

    // Convert to optimal format
    const optimized = await convertToMP3(withFades, {
      bitrate: 128,
      sampleRate: 24000
    });

    processedChapters.push(optimized);
  }

  // Combine all chapters
  const masterFile = await combineAudioFiles(processedChapters, {
    addChapterMarkers: true,
    addMetadata: metadata
  });

  // Generate preview
  const preview = await extractClip(masterFile, {
    start: 0,
    duration: 30
  });

  return { masterFile, preview, chapters: processedChapters };
}
```

## Agent Workflow Architecture

### Sequential Pipeline
```
User Input
    ↓
Research Agent (analyze topic, gather context)
    ↓
Planning Agent (create structure)
    ↓
For each chapter:
    ↓
    Writing Agent (draft chapter)
    ↓
    Editor Agent (polish chapter)
    ↓
(Continue for all chapters)
    ↓
Editor Agent (final review of complete story)
    ↓
Voice Agent (prepare for narration)
    ↓
AWS Polly (synthesize speech)
    ↓
Audio Engineer Agent (process & optimize)
    ↓
Final Audiobook Ready
```

### Progress Tracking Flow
```
Phase 1: Research & Planning (0-20%)
├─ 0-5%:   System initialization
├─ 5-12%:  Research Agent analyzing
└─ 12-20%: Planning Agent structuring

Phase 2: Chapter Generation (20-70%)
├─ Per chapter (distributed across percentage):
│   ├─ Writing Agent drafts (60% of chapter time)
│   └─ Editor Agent polishes (40% of chapter time)
└─ Progress increases linearly per chapter

Phase 3: Final Review (70-85%)
├─ 70-75%: Editor Agent full narrative review
├─ 75-80%: Editor Agent enhancing transitions
└─ 80-85%: Editor Agent final polish

Phase 4: Audio Production (85-100%)
├─ 85-90%: Voice Agent preparing narration
├─ 90-95%: AWS Polly synthesizing speech
└─ 95-100%: Audio Engineer Agent processing
```

## Agent Communication Protocol

### Message Format
```json
{
  "timestamp": "2025-10-01T10:30:00Z",
  "agent": "research|planning|writer|editor|voice|audio",
  "status": "working|complete|error",
  "progress": 15,
  "message": "Human-readable status message",
  "activity": "Specific task being performed",
  "data": {
    // Agent-specific output data
  },
  "metadata": {
    "chapterNumber": 1,
    "wordCount": 485,
    "estimatedTimeRemaining": "2m 30s"
  }
}
```

### Example Message Sequence
```json
// Research Agent starts
{
  "agent": "research",
  "progress": 5,
  "message": "Research Agent analyzing topic...",
  "activity": "Analyzing 'The Lost City of Atlantis' for fiction genre"
}

// Research Agent completes
{
  "agent": "research",
  "progress": 12,
  "message": "Research complete",
  "activity": "Found 3 core themes and 5 plot elements",
  "data": {
    "themes": [...],
    "plotElements": [...]
  }
}

// Planning Agent starts
{
  "agent": "planning",
  "progress": 15,
  "message": "Planning Agent creating structure...",
  "activity": "Designing 5-chapter story arc"
}

// And so on...
```

## Implementation with AWS Bedrock

### Single Model vs Multiple Models

#### Option 1: Single Model with Role Prompts (Recommended)
Use one Claude model with different system prompts for each agent role.

**Pros**:
- Cost-effective (single model invocation per task)
- Simpler to implement
- Consistent quality across agents
- Claude is excellent at role-playing different personas

**Cons**:
- Less true "multi-agent" behavior
- Cannot run agents in parallel

**Implementation**:
```javascript
async function invokeAgent(agentRole, prompt, context) {
  const systemPrompts = {
    research: "You are a Research Agent specializing in story analysis...",
    planning: "You are a Story Planning Agent expert at structure...",
    writer: "You are a Creative Writing Agent skilled in narrative...",
    editor: "You are an Editor Agent focused on quality and polish...",
    voice: "You are a Voice Production Agent preparing audio narration..."
  };

  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: "anthropic.claude-v2",
    body: JSON.stringify({
      prompt: `\n\nHuman: ${systemPrompts[agentRole]}\n\n${prompt}\n\nAssistant:`,
      max_tokens_to_sample: 4096
    })
  }));

  return JSON.parse(response.body);
}
```

#### Option 2: True Multi-Agent with Parallel Processing
Use AWS Step Functions to orchestrate multiple concurrent model invocations.

**Pros**:
- True parallel processing where possible
- Faster overall generation time
- More realistic multi-agent behavior
- Can use different models for different agents

**Cons**:
- More complex architecture
- Higher AWS costs
- Requires Step Functions setup

**Architecture**:
```
Step Functions State Machine:
├─ Research Agent (Parallel)
├─ Planning Agent (Sequential - waits for Research)
├─ Chapter Generation (Parallel foreach)
│   ├─ Writing Agent (Chapter 1)
│   ├─ Writing Agent (Chapter 2)
│   └─ ...
├─ Editor Agent (Sequential - reviews all)
├─ Voice Agent (Parallel foreach)
│   ├─ Prepare Chapter 1
│   ├─ Prepare Chapter 2
│   └─ ...
└─ Audio Engineer (Sequential - combines all)
```

### Recommended Architecture: Hybrid Approach

```javascript
class StoryGenerationPipeline {
  async generateStory(params) {
    // Phase 1: Sequential (Research → Planning)
    const research = await this.researchAgent.analyze(params);
    const plan = await this.planningAgent.createStructure(research);

    // Phase 2: Sequential per chapter (but could be parallel)
    const chapters = [];
    for (const chapterOutline of plan.chapters) {
      const draft = await this.writingAgent.writeChapter(chapterOutline);
      const polished = await this.editorAgent.polishChapter(draft);
      chapters.push(polished);
    }

    // Phase 3: Final review
    const finalStory = await this.editorAgent.reviewFullStory(chapters);

    // Phase 4: Parallel audio generation
    const audioPromises = chapters.map(chapter =>
      this.voiceAgent.prepareNarration(chapter)
        .then(prepared => this.synthesizeAudio(prepared))
    );
    const audioFiles = await Promise.all(audioPromises);

    // Phase 5: Audio processing
    const masterAudio = await this.audioEngineer.processFinal(audioFiles);

    return { story: finalStory, audio: masterAudio };
  }
}
```

## Agent State Management

### State Storage
```json
{
  "generationId": "story-123",
  "status": "generating",
  "currentPhase": "chapter-generation",
  "currentAgent": "writer",
  "progress": 35,
  "startedAt": "2025-10-01T10:00:00Z",
  "estimatedCompletionAt": "2025-10-01T10:05:00Z",
  "agentStates": {
    "research": {
      "status": "complete",
      "completedAt": "2025-10-01T10:01:00Z",
      "output": {...}
    },
    "planning": {
      "status": "complete",
      "completedAt": "2025-10-01T10:02:00Z",
      "output": {...}
    },
    "writer": {
      "status": "working",
      "currentChapter": 2,
      "chaptersComplete": 1,
      "chaptersTotal": 5
    }
  },
  "artifacts": {
    "research": "s3://bucket/generations/story-123/research.json",
    "plan": "s3://bucket/generations/story-123/plan.json",
    "chapters": [
      "s3://bucket/generations/story-123/chapter-1.json"
    ]
  }
}
```

## Error Handling & Recovery

### Agent Failure Scenarios
```javascript
class AgentExecutor {
  async executeWithRetry(agent, task, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await agent.execute(task);
      } catch (error) {
        if (attempt === maxRetries) {
          // Final attempt failed - try fallback strategy
          return await this.fallbackStrategy(agent, task, error);
        }

        // Exponential backoff
        await this.sleep(1000 * Math.pow(2, attempt));
      }
    }
  }

  async fallbackStrategy(agent, task, error) {
    switch (agent.type) {
      case 'research':
        // Use simplified research if detailed analysis fails
        return this.simplifiedResearch(task);

      case 'writer':
        // Reduce chapter length if generation fails
        return this.shorterChapter(task);

      case 'editor':
        // Skip advanced edits if polish fails
        return this.basicEditing(task);

      default:
        throw new Error(`Agent ${agent.type} failed: ${error.message}`);
    }
  }
}
```

## Testing Agents

### Unit Testing Individual Agents
```javascript
describe('Research Agent', () => {
  it('should analyze fiction topics correctly', async () => {
    const input = {
      topic: "The Lost City of Atlantis",
      genre: "fiction",
      targetAudience: "Young adults"
    };

    const result = await researchAgent.analyze(input);

    expect(result.themes).toHaveLength(3);
    expect(result.plotElements).toContain('underwater expedition');
    expect(result.characterArchetypes).toBeDefined();
  });
});

describe('Planning Agent', () => {
  it('should create appropriate structure for medium length', async () => {
    const research = mockResearchOutput();
    const result = await planningAgent.createStructure(research, 'medium');

    expect(result.chapters).toHaveLength(5);
    expect(result.storyArc).toHaveProperty('climax');
  });
});
```

### Integration Testing Full Pipeline
```javascript
describe('Full Story Generation Pipeline', () => {
  it('should generate complete audiobook', async () => {
    const params = {
      topic: "Space exploration",
      genre: "fiction",
      length: "short",
      tone: "adventurous",
      voiceId: "narrator-classic"
    };

    const result = await pipeline.generateStory(params);

    expect(result.story.chapters).toHaveLength(3);
    expect(result.audio.masterFile).toBeDefined();
    expect(result.story.metadata.wordCount).toBeGreaterThan(1000);
  });
}, 30000); // 30 second timeout
```

## Monitoring & Observability

### Metrics to Track
```javascript
{
  "metrics": {
    "totalGenerations": 150,
    "averageGenerationTime": "4m 32s",
    "agentPerformance": {
      "research": { "avgTime": "12s", "successRate": 99.5 },
      "planning": { "avgTime": "15s", "successRate": 99.0 },
      "writer": { "avgTime": "35s/chapter", "successRate": 98.0 },
      "editor": { "avgTime": "20s/chapter", "successRate": 99.5 },
      "voice": { "avgTime": "8s", "successRate": 100 },
      "audio": { "avgTime": "25s", "successRate": 100 }
    },
    "errorRate": 0.5,
    "retryRate": 2.3,
    "userSatisfaction": 4.7
  }
}
```

### Logging
```javascript
logger.info('Agent execution started', {
  agent: 'writer',
  generationId: 'story-123',
  chapterNumber: 2,
  timestamp: Date.now()
});

logger.info('Agent execution completed', {
  agent: 'writer',
  generationId: 'story-123',
  chapterNumber: 2,
  duration: '35s',
  wordCount: 485,
  timestamp: Date.now()
});
```

## Cost Optimization

### Token Usage Optimization
```javascript
// Estimate tokens before calling
function estimateTokens(text) {
  return Math.ceil(text.length / 4); // Rough estimate
}

// Use appropriate max_tokens per agent
const tokenLimits = {
  research: 2000,    // Research summaries
  planning: 3000,    // Structured outlines
  writer: 2000,      // Per chapter (500-600 words)
  editor: 2500,      // Polished chapter
  voice: 1500        // SSML and notes
};

// Reuse research and planning across similar requests
const cache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 60 // 1 hour
});
```

## Scalability Considerations

### Handling Concurrent Requests
```javascript
// Queue system for managing multiple story generations
class GenerationQueue {
  constructor(maxConcurrent = 5) {
    this.queue = [];
    this.active = 0;
    this.maxConcurrent = maxConcurrent;
  }

  async add(generationTask) {
    if (this.active >= this.maxConcurrent) {
      await this.waitForSlot();
    }

    this.active++;
    try {
      return await generationTask();
    } finally {
      this.active--;
      this.processQueue();
    }
  }
}
```

---

**Ready to implement**: This architecture provides a robust, scalable foundation for Story42's multi-agent story generation system.
