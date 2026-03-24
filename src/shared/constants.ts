import type { DomainStatus } from './types';

export const BUDGET = {
  WATCHLIST_RESERVE: 400,
  AD_HOC_LIMIT: 100,
  HARD_CAP: 480,
  DAILY_MAX: 500,
} as const;

export const THROTTLE_MS = 15_000;
export const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
export const ADHOC_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const ALARM_NAME = 'watchlist-tick';
export const ALARM_PERIOD_MINUTES = 60;

export const VT_API_BASE = 'https://www.virustotal.com/api/v3';

export const BADGE_CONFIG: Record<DomainStatus | 'stale', { color: string; text: string }> = {
  clean:      { color: '#22c55e', text: '\u2713' },
  suspicious: { color: '#f59e0b', text: '!' },
  malicious:  { color: '#ef4444', text: '\u2717' },
  unknown:    { color: '#6b7280', text: '?' },
  pending:    { color: '#3b82f6', text: '\u2026' },
  stale:      { color: '#6b7280', text: '?' },
};

export const UNSUPPORTED_PROTOCOLS = [
  'chrome:', 'chrome-extension:', 'edge:', 'about:',
  'moz-extension:', 'file:', 'data:', 'blob:',
];

export const STORAGE_KEYS = {
  DOMAINS: 'domains',
  API_USAGE: 'api_usage',
  VT_API_KEY: 'vt_api_key',
  CHECK_INTERVAL: 'check_interval_hours',
  THEME: 'theme',
  PAUSE_UNTIL: 'pause_until',
  RESCAN_POLICY: 'rescan_policy',
} as const;

export const PAUSE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export const RETRY = {
  MAX_ATTEMPTS: 3,
  NETWORK_DELAY_MS: 30_000,
  RATE_LIMIT_DELAY_MS: 60_000,
} as const;
