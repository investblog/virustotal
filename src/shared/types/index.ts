export interface VtStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

export type DomainStatus = 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'pending';

export interface DomainRecord {
  domain: string;
  watchlist: boolean;
  added_at: number;
  last_checked: number;
  vt_last_analysis_date: number | null;
  vt_stats: VtStats | null;
  status: DomainStatus;
}

export interface ApiUsage {
  count: number;
  date: string;
}

export type QueuePriority = 'high' | 'normal' | 'low';

export interface QueueItem {
  domain: string;
  priority: QueuePriority;
}

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'auto';
export type CheckInterval = 12 | 24 | 72 | 168;

export interface VtDomainResponse {
  data: {
    attributes: {
      last_analysis_stats: VtStats;
      last_analysis_date: number;
    };
  };
}
