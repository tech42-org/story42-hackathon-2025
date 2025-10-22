/**
 * Story Storage Service - Local Storage Management
 * Handles caching of story outlines and complete stories in browser local storage
 */

const STORAGE_PREFIX = 'story_builder_';
const OUTLINE_SUFFIX = '_outline';
const STORY_SUFFIX = '_story';
const AUDIO_SUFFIX = '_audio';

/**
 * Generate storage key for a session
 * @param {string} sessionId - Session identifier
 * @param {string} type - Type of data ('outline' or 'story')
 * @returns {string} Storage key
 */
const getStorageKey = (sessionId, type) => {
  let suffix = STORY_SUFFIX;
  if (type === 'outline') {
    suffix = OUTLINE_SUFFIX;
  } else if (type === 'audio') {
    suffix = AUDIO_SUFFIX;
  }
  return `${STORAGE_PREFIX}${sessionId}${suffix}`;
};

/**
 * Save outline to local storage
 * @param {string} sessionId - Session identifier
 * @param {Object} outlineData - Outline data to save
 * @returns {boolean} Success status
 */
export const saveOutline = (sessionId, outlineData) => {
  try {
    const key = getStorageKey(sessionId, 'outline');
    const data = {
      timestamp: Date.now(),
      sessionId,
      ...outlineData
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('✅ Outline saved to local storage:', sessionId);
    return true;
  } catch (error) {
    console.error('❌ Failed to save outline to local storage:', error);
    return false;
  }
};

/**
 * Load outline from local storage
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Outline data or null if not found
 */
export const loadOutline = (sessionId) => {
  try {
    const key = getStorageKey(sessionId, 'outline');
    const data = localStorage.getItem(key);
    if (!data) {
      console.log('ℹ️ No outline found in local storage:', sessionId);
      return null;
    }
    const parsed = JSON.parse(data);
    console.log('✅ Outline loaded from local storage:', sessionId);
    return parsed;
  } catch (error) {
    console.error('❌ Failed to load outline from local storage:', error);
    return null;
  }
};

/**
 * Save complete story to local storage
 * @param {string} sessionId - Session identifier
 * @param {Object} storyData - Complete story data to save
 * @returns {boolean} Success status
 */
export const saveStory = (sessionId, storyData) => {
  try {
    const key = getStorageKey(sessionId, 'story');
    const data = {
      timestamp: Date.now(),
      sessionId,
      ...storyData
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('✅ Complete story saved to local storage:', sessionId);
    return true;
  } catch (error) {
    console.error('❌ Failed to save story to local storage:', error);
    return false;
  }
};

/**
 * Load complete story from local storage
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Story data or null if not found
 */
export const loadStory = (sessionId) => {
  try {
    const key = getStorageKey(sessionId, 'story');
    const data = localStorage.getItem(key);
    if (!data) {
      console.log('ℹ️ No story found in local storage:', sessionId);
      return null;
    }
    const parsed = JSON.parse(data);
    console.log('✅ Complete story loaded from local storage:', sessionId);
    return parsed;
  } catch (error) {
    console.error('❌ Failed to load story from local storage:', error);
    return null;
  }
};

/**
 * Clear all cached data for a session
 * @param {string} sessionId - Session identifier
 * @returns {boolean} Success status
 */
export const clearSession = (sessionId) => {
  try {
    const outlineKey = getStorageKey(sessionId, 'outline');
    const storyKey = getStorageKey(sessionId, 'story');
    const audioKey = getStorageKey(sessionId, 'audio');
    localStorage.removeItem(outlineKey);
    localStorage.removeItem(storyKey);
    localStorage.removeItem(audioKey);
    console.log('✅ Session data cleared from local storage:', sessionId);
    return true;
  } catch (error) {
    console.error('❌ Failed to clear session data:', error);
    return false;
  }
};

/**
 * Get all cached session IDs
 * @returns {Array<string>} Array of session IDs
 */
export const getCachedSessions = () => {
  try {
    const sessions = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        // Extract session ID from key
        const sessionId = key
          .replace(STORAGE_PREFIX, '')
          .replace(OUTLINE_SUFFIX, '')
          .replace(STORY_SUFFIX, '');
        sessions.add(sessionId);
      }
    }
    return Array.from(sessions);
  } catch (error) {
    console.error('❌ Failed to get cached sessions:', error);
    return [];
  }
};

/**
 * Clear old cached data (older than specified days)
 * @param {number} daysOld - Age threshold in days
 * @returns {number} Number of items cleared
 */
export const clearOldCache = (daysOld = 7) => {
  try {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let clearedCount = 0;

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data.timestamp && data.timestamp < cutoffTime) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        } catch (e) {
          // If we can't parse it, remove it
          localStorage.removeItem(key);
          clearedCount++;
        }
      }
    }

    console.log(`✅ Cleared ${clearedCount} old cache items`);
    return clearedCount;
  } catch (error) {
    console.error('❌ Failed to clear old cache:', error);
    return 0;
  }
};

export const saveAudioState = (sessionId, state) => {
  try {
    const key = getStorageKey(sessionId, 'audio');
    const payload = {
      timestamp: Date.now(),
      sessionId,
      ...state
    };
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('❌ Failed to save audio state:', error);
    return false;
  }
};

export const loadAudioState = (sessionId) => {
  try {
    const key = getStorageKey(sessionId, 'audio');
    const data = localStorage.getItem(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to load audio state:', error);
    return null;
  }
};

export default {
  saveOutline,
  loadOutline,
  saveStory,
  loadStory,
  clearSession,
  getCachedSessions,
  clearOldCache,
  saveAudioState,
  loadAudioState
};

