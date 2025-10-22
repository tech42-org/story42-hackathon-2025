export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const AGENT_API_BASE_URL =
  import.meta.env.VITE_AGENT_API_BASE_URL ?? API_BASE_URL;

export const BUILDER_API_BASE_URL =
  import.meta.env.VITE_BUILDER_API_BASE_URL ?? API_BASE_URL;

export const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
export const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
