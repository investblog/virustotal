import type { VtStats, VtVendorResult, VtVendorCategory, VtDomainResponse } from './types';
import { VT_API_BASE } from './constants';

export interface VtCheckResult {
  stats: VtStats;
  lastAnalysisDate: number;
  vendors: VtVendorResult[];
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

    // Parse per-vendor results
    const vendors: VtVendorResult[] = [];
    const raw = attrs.last_analysis_results;
    if (raw) {
      for (const [name, entry] of Object.entries(raw)) {
        const cat = entry.category as VtVendorCategory;
        if (cat === 'malicious' || cat === 'suspicious') {
          vendors.push({ vendor: name, category: cat, result: entry.result || cat });
        }
      }
      vendors.sort((a, b) => {
        if (a.category === 'malicious' && b.category !== 'malicious') return -1;
        if (a.category !== 'malicious' && b.category === 'malicious') return 1;
        return a.vendor.localeCompare(b.vendor);
      });
    }

    return {
      ok: true,
      data: {
        stats: attrs.last_analysis_stats,
        lastAnalysisDate: attrs.last_analysis_date * 1000,
        vendors,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}

/**
 * Request VT to rescan a domain. POST /domains/{domain}/analyse
 * Returns true on success (202), false on error.
 */
export async function rescanDomain(domain: string, apiKey: string): Promise<VtResult> {
  try {
    const res = await fetch(`${VT_API_BASE}/domains/${encodeURIComponent(domain)}/analyse`, {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
    });

    if (res.status === 401) return { ok: false, error: { kind: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { kind: 'rate_limited' } };
    if (res.status === 404) return { ok: false, error: { kind: 'not_found' } };

    // 200 or 202 = success — VT queued the rescan
    if (res.ok) {
      // Re-fetch fresh results after rescan is queued
      return checkDomain(domain, apiKey);
    }

    return { ok: false, error: { kind: 'network', message: `HTTP ${res.status}` } };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}
