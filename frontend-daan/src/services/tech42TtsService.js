// Tech42 TTS API Service
import { getApiKey } from '../lib/apiKeyUtils';

const TECH42_TTS_API_BASE = 'http://tech42-tts-gpu-alb-1201907864.us-east-1.elb.amazonaws.com:82';

const buildAuthHeaders = () => {
  const apiKey = getApiKey();
  return apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
};

/**
 * Get all available voices
 * @returns {Promise<Array>} List of available voices
 */
export const getVoices = async () => {
  try {
    const response = await fetch(`${TECH42_TTS_API_BASE}/voices`, {
      method: 'GET',
      headers: {
        ...buildAuthHeaders(),
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }

    const voices = await response.json();
    return voices;
  } catch (error) {
    console.error('Failed to get voices:', error);
    throw error;
  }
};

/**
 * Upload a custom voice
 * @param {File} file - Audio file for the voice
 * @param {string} name - Name for the custom voice
 * @returns {Promise<Object>} Upload result
 */
export const uploadVoice = async (file, name) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    const response = await fetch(`${TECH42_TTS_API_BASE}/admin/voices`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to upload voice: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Failed to upload voice:', error);
    throw error;
  }
};

/**
 * Preview a voice by playing a sample
 * @param {string} voiceName - Name of the voice to preview
 * @returns {Promise<void>}
 */
export const previewVoice = async (voiceName) => {
  try {
    const audioUrl = `${TECH42_TTS_API_BASE}/admin/voices/${encodeURIComponent(voiceName)}/download`;
    
    console.log(`🎵 Playing voice preview for: ${voiceName}`);
    console.log(`📍 Audio URL: ${audioUrl}`);
    
    // Fetch the audio file as a blob to have better control over format
    console.log('📥 Fetching audio file...');
    const response = await fetch(audioUrl, {
      headers: buildAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch voice file: ${response.status} ${response.statusText}`);
    }
    
    // Get the content type from response headers
    const contentType = response.headers.get('content-type') || 'audio/wav';
    console.log(`📋 Content-Type: ${contentType}`);
    
    const audioBlob = await response.blob();
    console.log(`📦 Audio blob size: ${audioBlob.size} bytes`);
    
    // Create a blob URL with explicit MIME type
    const blobUrl = URL.createObjectURL(
      new Blob([audioBlob], { type: contentType })
    );
    
    // Create audio element and play
    const audio = new Audio(blobUrl);
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(blobUrl);
    }, 30000); // 30 second timeout
    
    return new Promise((resolve, reject) => {
      audio.onloadstart = () => {
        console.log('📥 Audio loading started');
      };
      
      audio.oncanplay = () => {
        console.log('✓ Audio ready to play');
      };
      
      audio.onended = () => {
        clearTimeout(timeoutId);
        URL.revokeObjectURL(blobUrl);
        console.log('✅ Voice preview completed');
        resolve();
      };
      
      audio.onerror = (error) => {
        clearTimeout(timeoutId);
        URL.revokeObjectURL(blobUrl);
        console.error('❌ Voice preview error:', error);
        console.error('Audio error code:', audio.error?.code);
        const errorCodeMap = {
          1: 'MEDIA_ERR_ABORTED',
          2: 'MEDIA_ERR_NETWORK',
          3: 'MEDIA_ERR_DECODE',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };
        const errorCode = audio.error?.code || 'unknown';
        const errorCodeName = errorCodeMap[errorCode] || 'Unknown error';
        const errorMsg = `Audio playback error (${errorCodeName}): ${audio.error?.message || 'Failed to load or play audio'}`;
        reject(new Error(errorMsg));
      };
      
      audio.play().catch(error => {
        clearTimeout(timeoutId);
        URL.revokeObjectURL(blobUrl);
        console.error('❌ Failed to start audio playback:', error);
        reject(new Error(`Playback failed: ${error.message}`));
      });
    });
  } catch (error) {
    console.error('Failed to preview voice:', error);
    throw error;
  }
};

export default {
  getVoices,
  uploadVoice,
  previewVoice
};
