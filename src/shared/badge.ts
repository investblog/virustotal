import type { DomainRecord, DomainStatus } from './types';
import { BADGE_CONFIG, STALE_THRESHOLD_MS } from './constants';

export interface BadgeDescriptor {
  text: string;
  color: string;
}

export const BADGE_EMPTY: BadgeDescriptor = { text: '', color: '' };

export function isStale(record: DomainRecord): boolean {
  if (!record.vt_last_analysis_date) return false;
  return (Date.now() - record.vt_last_analysis_date) > STALE_THRESHOLD_MS;
}

export function computeStatus(stats: { malicious: number; suspicious: number } | null): DomainStatus {
  if (!stats) return 'unknown';
  if (stats.malicious > 0) return 'malicious';
  if (stats.suspicious > 0) return 'suspicious';
  return 'clean';
}

export function computeBadge(record: DomainRecord | null, queued: boolean): BadgeDescriptor {
  if (!record && !queued) return BADGE_EMPTY;

  if (!record && queued) return BADGE_CONFIG.pending;

  if (record) {
    if (record.status === 'pending') return BADGE_CONFIG.pending;
    if (isStale(record)) return BADGE_CONFIG.stale;
    return BADGE_CONFIG[record.status] || BADGE_CONFIG.unknown;
  }

  return BADGE_CONFIG.unknown;
}
