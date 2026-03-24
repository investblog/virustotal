export interface VtStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

export type DomainStatus = 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'pending';

export type VtVendorCategory = 'malicious' | 'suspicious' | 'harmless' | 'undetected';

export interface VtVendorResult {
  vendor: string;
  category: VtVendorCategory;
  result: string;
}

export type DisputeStatus = 'none' | 'disputed' | 'resolved';

export interface DomainRecord {
  domain: string;
  watchlist: boolean;
  added_at: number;
  last_checked: number;
  vt_last_analysis_date: number | null;
  vt_stats: VtStats | null;
  vt_vendors: VtVendorResult[] | null;
  status: DomainStatus;
  disputes?: Record<string, DisputeStatus>;
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
      last_analysis_results?: Record<string, {
        category: string;
        result: string;
        method?: string;
        engine_name?: string;
      }>;
    };
  };
}
