/**
 * Utility functions for API key management
 */

/**
 * Get the stored API key from localStorage
 * @returns {string} The stored API key or default fallback
 */
export const getApiKey = () => {
  return localStorage.getItem('tech42_tts_api_key') || localStorage.getItem('story42_api_key') || '';
};

/**
 * Set the API key in localStorage
 * @param {string} apiKey - The API key to store
 */
export const setApiKey = (apiKey) => {
  if (localStorage.getItem('story42_api_key')) {
    localStorage.removeItem('story42_api_key');
  }
  localStorage.setItem('tech42_tts_api_key', apiKey);
};

/**
 * Remove the API key from localStorage
 */
export const clearApiKey = () => {
  localStorage.removeItem('tech42_tts_api_key');
  localStorage.removeItem('story42_api_key');
};

/**
 * Check if an API key is configured
 * @returns {boolean} True if API key exists in localStorage
 */
export const hasApiKey = () => {
  return !!(localStorage.getItem('tech42_tts_api_key') || localStorage.getItem('story42_api_key'));
};

