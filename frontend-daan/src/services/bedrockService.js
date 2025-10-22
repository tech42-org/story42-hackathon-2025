// AWS Bedrock Service for Story Generation
// This will integrate with AWS Bedrock to generate stories and audio

import { authHeaders } from '../lib/api';
import { AGENT_API_BASE_URL } from '../config';

/**
 * Generate a complete story using AWS Bedrock
 * @param {Object} params - Story generation parameters
 * @returns {Promise<Object>} Generated story content
 */
export const generateStory = async () => {
  throw new Error('generateStory is not supported; use streamStoryGeneration instead.');
};

/**
 * Generate audio narration using AWS Polly or similar
 * @param {string} text - Text to convert to speech
 * @param {Object} voiceOptions - Voice configuration
 * @returns {Promise<string>} Audio URL
 */
export const generateAudio = async () => {
  throw new Error('generateAudio is not supported; audio generation happens server-side.');
};

/**
 * Stream story generation for real-time progress updates with REAL backend streaming
 * @param {Object} params - Story generation parameters
 * @param {Function} onProgress - Progress callback
 * @param {Function} onAgentActivity - Agent activity callback
 */
export const streamStoryGeneration = async (payload, handleEvent) => {
  const { idToken: requestIdToken, ...bodyPayload } = payload || {};

  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };

  if (requestIdToken) {
    headers.Authorization = `Bearer ${requestIdToken}`;
  }

  const response = await fetch(`${AGENT_API_BASE_URL}/api/v1/story/generate-pipeline`, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming is not supported in this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';

      lines.forEach((line) => {
        if (!line.startsWith('data: ')) return;

        const payload = line.slice(6).trim();
        if (!payload) return;

        try {
          const event = JSON.parse(payload);
          handleEvent?.(event);
        } catch (err) {
          console.error('Failed to parse SSE event', err, payload);
        }
      });
    }

    if (done) {
      if (pending.startsWith('data: ')) {
        const payload = pending.slice(6).trim();
        if (payload) {
          try {
            const event = JSON.parse(payload);
            handleEvent?.(event);
          } catch (err) {
            console.error('Failed to parse trailing SSE event', err, payload);
          }
        }
      }
      break;
    }
  }
};

export default {
  streamStoryGeneration,
};
