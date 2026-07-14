export { default as Colors } from './colors';

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  USER_DATA: '@user_data',
  CONVERSION_HISTORY: '@conversion_history',
};

export const API_TIMEOUT = 30000; // 30s — accounts for Render free-tier cold starts
