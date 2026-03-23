import type { VtStats, VtDomainResponse } from './types';
import { VT_API_BASE } from './constants';

export interface VtCheckResult {
  stats: VtStats;
  lastAnalysisDate: number;
}

export type VtError =
  | { kind: 'invalid_key' }
  | { kind: 'rate_limited' }
  | { kind: 'not_found' }
  | { kind: 'network'; message: string };

export type VtResult =
  | { ok: true; data: VtCheckResult }
  | { ok: false; error: VtError };

export async function checkDomain(domain: string, apiKey: string): Promise<VtResult> {
  try {
    const res = await fetch(`${VT_API_BASE}/domains/${encodeURIComponent(domain)}`, {
      headers: { 'x-apikey': apiKey },
    });

    if (res.status === 401) return { ok: false, error: { kind: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { kind: 'rate_limited' } };
    if (res.status === 404) return { ok: false, error: { kind: 'not_found' } };

    if (!res.ok) {
      return { ok: false, error: { kind: 'network', message: `HTTP ${res.status}` } };
    }

    const json = (await res.json()) as VtDomainResponse;
    const attrs = json.data.attributes;

    return {
      ok: true,
      data: {
        stats: attrs.last_analysis_stats,
        lastAnalysisDate: attrs.last_analysis_date * 1000,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}
