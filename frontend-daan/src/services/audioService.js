/**
 * Audio Service for streaming PCM audio from stories
 * Integrates with backend TTS streaming API
 */

import { AGENT_API_BASE_URL } from '../config';

class AudioService {
  constructor() {
    this.audioContext = null;
    this.nextStartTime = 0;
    this.isPlaying = false;
    this.currentReader = null;
    this.apiKey = null; // TTS API key if needed
  }

  /**
   * Initialize Web Audio API context
   */
  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Set TTS API key for authentication
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Stream and play audio for a story
   * @param {string} storyId - The story ID to play
   * @param {function} onProgress - Callback for progress updates
   * @param {function} onComplete - Callback when playback completes
   * @param {function} onError - Callback for errors
   */
  async streamStoryAudio(storyId, onProgress, onComplete, onError) {
    try {
      // Initialize audio context
      const audioContext = this.initAudioContext();
      this.nextStartTime = audioContext.currentTime;
      this.isPlaying = true;

      // Build request headers
      const headers = {};
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      // Start streaming from backend
      const response = await fetch(`${AGENT_API_BASE_URL}/api/stories/${storyId}/audio/stream`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get reader for streaming response
      const reader = response.body.getReader();
      this.currentReader = reader;

      let totalBytes = 0;
      let chunkCount = 0;

      console.log('🎵 Starting audio stream playback...');

      // Read and play PCM chunks as they arrive
      while (this.isPlaying) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✅ Audio stream complete');
          break;
        }

        if (value && value.length > 0) {
          totalBytes += value.length;
          chunkCount++;

          // Convert PCM bytes to audio and play
          await this.playPCMChunk(value, audioContext);

          // Report progress
          if (onProgress) {
            onProgress({
              totalBytes,
              chunkCount,
              isPlaying: this.isPlaying
            });
          }

          // Small delay to prevent overwhelming the audio buffer
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      this.isPlaying = false;
      if (onComplete) {
        onComplete({ totalBytes, chunkCount });
      }

    } catch (error) {
      console.error('❌ Audio streaming error:', error);
      this.isPlaying = false;
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }

  /**
   * Play a single PCM audio chunk
   * @param {Uint8Array} pcmBytes - Raw PCM audio bytes
   * @param {AudioContext} audioContext - Web Audio API context
   */
  async playPCMChunk(pcmBytes, audioContext) {
    try {
      // Minimum chunk size for playback
      if (pcmBytes.length < 1024) {
        return;
      }

      // Convert raw PCM bytes (int16) to Float32Array
      const pcm16 = new Int16Array(pcmBytes.buffer);
      const pcmFloat = new Float32Array(pcm16.length);
      
      for (let i = 0; i < pcm16.length; i++) {
        pcmFloat[i] = pcm16[i] / 32768.0; // Normalize to [-1, 1]
      }

      // Create audio buffer from PCM data
      const sampleRate = 24000; // 24kHz sample rate
      const audioBuffer = audioContext.createBuffer(1, pcmFloat.length, sampleRate);
      audioBuffer.getChannelData(0).set(pcmFloat);

      // Create and schedule audio source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Schedule playback to maintain continuity
      const startTime = Math.max(audioContext.currentTime, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;

      console.log(`🔊 Playing chunk: ${audioBuffer.duration.toFixed(3)}s`);

    } catch (error) {
      console.warn('⚠️ Could not play PCM chunk:', error.message);
    }
  }

  /**
   * Stop audio playback
   */
  stop() {
    this.isPlaying = false;
    
    if (this.currentReader) {
      try {
        this.currentReader.cancel();
      } catch (e) {
        console.warn('Could not cancel reader:', e);
      }
      this.currentReader = null;
    }

    // Reset audio context timing
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  /**
   * Pause audio playback
   */
  pause() {
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }
  }

  /**
   * Resume audio playback
   */
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Get audio metadata for a story
   * @param {string} storyId - The story ID
   */
  async getAudioMetadata(storyId) {
    try {
      const headers = {};
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(
        `${AGENT_API_BASE_URL}/api/stories/${storyId}/audio/generate`,
        {
          method: 'POST',
          headers
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error getting audio metadata:', error);
      throw error;
    }
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying() {
    return this.isPlaying;
  }

  /**
   * Stream and play a voice preview (first 2 sentences)
   * @param {string} text - Sample text to preview
   * @param {string} voiceId - Voice ID to use
   * @param {function} onComplete - Callback when preview completes
   * @param {function} onError - Callback for errors
   */
  async streamVoicePreview(text, voiceId, onComplete, onError) {
    try {
      // Initialize audio context
      const audioContext = this.initAudioContext();
      this.nextStartTime = audioContext.currentTime;
      this.isPlaying = true;

      // Build request headers
      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      // Start streaming preview from backend
      const response = await fetch(`${AGENT_API_BASE_URL}/api/audio/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: text,
          voice_id: voiceId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get reader for streaming response
      const reader = response.body.getReader();
      this.currentReader = reader;

      let totalBytes = 0;

      console.log('🎵 Starting preview audio...');

      // Read and play PCM chunks as they arrive
      while (this.isPlaying) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✅ Preview complete');
          break;
        }

        if (value && value.length > 0) {
          totalBytes += value.length;

          // Convert PCM bytes to audio and play
          await this.playPCMChunk(value, audioContext);

          // Small delay to prevent overwhelming the audio buffer
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      this.isPlaying = false;
      if (onComplete) {
        onComplete({ totalBytes });
      }

    } catch (error) {
      console.error('❌ Preview audio error:', error);
      this.isPlaying = false;
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const audioService = new AudioService();
export default audioService;

