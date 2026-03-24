import type { VtStats, VtVendorResult, VtVendorCategory, VtDomainResponse, WhoisInfo } from './types';
import { VT_API_BASE } from './constants';

export interface VtCheckResult {
  stats: VtStats;
  lastAnalysisDate: number;
  vendors: VtVendorResult[];
  whois: WhoisInfo | null;
}

function parseWhois(attrs: VtDomainResponse['data']['attributes']): WhoisInfo | null {
  const raw = attrs.whois;
  if (!raw) return null;
  const whoisText = raw;

  function extract(pattern: RegExp): string | null {
    const m = whoisText.match(pattern);
    return m?.[1]?.trim() || null;
  }

  const registrar = attrs.registrar as string | undefined
    ?? extract(/Registrar:\s*(.+)/i)
    ?? extract(/Sponsoring Registrar:\s*(.+)/i);

  const creation = extract(/Creation Date:\s*(.+)/i)
    ?? extract(/Created Date:\s*(.+)/i)
    ?? extract(/created:\s*(.+)/i);

  const expiration = extract(/Expir(?:y|ation) Date:\s*(.+)/i)
    ?? extract(/Registry Expiry Date:\s*(.+)/i)
    ?? extract(/paid-till:\s*(.+)/i);

  const nsMatches = whoisText.match(/Name Server:\s*(.+)/gi) || [];
  const nameServers = nsMatches
    .map(l => l.replace(/Name Server:\s*/i, '').trim().toLowerCase())
    .filter(Boolean);

  if (!registrar && !creation && !expiration && !nameServers.length) return null;

  return {
    registrar: registrar || null,
    creation_date: creation || null,
    expiration_date: expiration || null,
    name_servers: nameServers,
  };
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
        whois: parseWhois(attrs),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}

export type RescanResult =
  | { ok: true; queued: true }
  | { ok: false; error: VtError };

/**
 * Request VT to rescan a domain. POST /domains/{domain}/analyse
 * Returns { queued: true } on success — VT will re-analyse asynchronously.
 * Caller should re-check the domain later (via normal queue) for fresh data.
 */
export async function rescanDomain(domain: string, apiKey: string): Promise<RescanResult> {
  try {
    const res = await fetch(`${VT_API_BASE}/domains/${encodeURIComponent(domain)}/analyse`, {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
    });

    if (res.status === 401) return { ok: false, error: { kind: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { kind: 'rate_limited' } };
    if (res.status === 404) return { ok: false, error: { kind: 'not_found' } };

    if (res.ok) return { ok: true, queued: true };

    return { ok: false, error: { kind: 'network', message: `HTTP ${res.status}` } };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}
