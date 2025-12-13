import { Theme } from './types';

export const STORAGE_KEYS = {
  CONFIG: 'foxy_config',
  SESSIONS: 'foxy_sessions',
  LAST_SCREEN: 'foxy_last_screen',
};

export const NETLIFY_AI_PROXY_URL = '/.netlify/functions/foxy-ai-proxy';

export const ACCENT_COLORS = {
  CYAN: '6, 182, 212',
  PINK: '236, 72, 153',
  EMERALD: '16, 185, 129',
  INDIGO: '99, 102, 241',
  ORANGE: '249, 115, 22',
};

export const DEFAULT_CONFIG = {
  userName: null,
  theme: Theme.DARK,
  accentColor: ACCENT_COLORS.CYAN,
};