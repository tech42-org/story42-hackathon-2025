import { AGENT_API_BASE_URL } from '../config';

export const getAccessToken = () => localStorage.getItem('access_token');

export const authHeaders = (extra = {}) => {
  const token = getAccessToken();
  return token
    ? {
        ...extra,
        Authorization: `Bearer ${token}`,
      }
    : extra;
};

export const fetchWithAuth = async (path, options = {}) => {
  const headers = authHeaders({ ...(options.headers || {}) });
  const response = await fetch(`${AGENT_API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response;
};

export const streamWithAuth = async (path, options = {}) => {
  const headers = authHeaders({ ...(options.headers || {}) });
  const response = await fetch(`${AGENT_API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response;
};

