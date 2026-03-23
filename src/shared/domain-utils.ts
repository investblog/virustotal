import { UNSUPPORTED_PROTOCOLS } from './constants';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isUnsupportedUrl(url: string): boolean {
  return UNSUPPORTED_PROTOCOLS.some(p => url.startsWith(p));
}

export function isIpOrLocalhost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  if (IPV4_RE.test(hostname)) return true;
  if (hostname.startsWith('[') || hostname.includes(':')) return true;
  return false;
}

export function extractDomain(url: string): string | null {
  if (!url || isUnsupportedUrl(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  let hostname = parsed.hostname.toLowerCase();
  if (isIpOrLocalhost(hostname)) return null;
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);
  if (!hostname || !hostname.includes('.')) return null;

  return hostname;
}

export function normalizeDomainInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // If user entered a URL, extract hostname
  if (trimmed.includes('://')) {
    return extractDomain(trimmed);
  }

  // Treat as bare domain
  let hostname = trimmed.replace(/\/.*$/, '');
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);
  if (!hostname || !hostname.includes('.')) return null;

  // Validate by constructing URL
  try {
    const url = new URL(`https://${hostname}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
