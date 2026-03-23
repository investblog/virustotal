import { UNSUPPORTED_PROTOCOLS } from './constants';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// --- Punycode decode (RFC 3492) ---

function adaptBias(delta: number, numPoints: number, first: boolean): number {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > 455) { d = Math.floor(d / 35); k += 36; }
  return k + Math.floor(36 * d / (d + 38));
}

function decodePunycode(input: string): string {
  const output: number[] = [];
  let n = 128, i = 0, bias = 72;

  const delim = input.lastIndexOf('-');
  if (delim > 0) {
    for (let j = 0; j < delim; j++) output.push(input.charCodeAt(j));
  }

  let pos = delim > 0 ? delim + 1 : 0;
  while (pos < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = 36; ; k += 36) {
      const c = input.charCodeAt(pos++);
      const digit = c >= 97 ? c - 97 : c >= 48 ? c - 22 : 0;
      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) break;
      w *= (36 - t);
    }
    const len = output.length + 1;
    bias = adaptBias(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    output.splice(i++, 0, n);
  }

  return String.fromCodePoint(...output);
}

/**
 * Decode an ASCII/punycode domain to Unicode for display.
 * "xn--80aodfsg.xn--p1ai" → "домены.рф"
 * Non-IDN domains pass through unchanged.
 */
export function toUnicode(ascii: string): string {
  if (!ascii.includes('xn--')) return ascii;
  try {
    return ascii.split('.').map(label =>
      label.startsWith('xn--') ? decodePunycode(label.slice(4)) : label,
    ).join('.');
  } catch {
    return ascii;
  }
}

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

  const parts = hostname.split('.');
  if (parts.length < 2 || parts.some(p => !p) || parts[parts.length - 1].length < 2) return null;

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
    const h = url.hostname.toLowerCase().replace(/^www\./, '');
    // Must have at least two parts with TLD >= 2 chars (e.g. "a.co")
    const parts = h.split('.');
    if (parts.length < 2 || parts.some(p => !p) || parts[parts.length - 1].length < 2) return null;
    return h;
  } catch {
    return null;
  }
}
