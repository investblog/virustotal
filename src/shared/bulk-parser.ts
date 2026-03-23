import { normalizeDomainInput } from './domain-utils';

export interface BulkParseResult {
  valid: string[];
  duplicate: string[];
  invalid: string[];
}

/**
 * Parse arbitrary text input into a deduplicated list of valid domains.
 * Handles: one-per-line, comma-separated, space-separated, full URLs, mixed text.
 */
export function parseBulkInput(text: string): BulkParseResult {
  const valid: string[] = [];
  const duplicate: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  // Split on newlines, commas, spaces, tabs
  const tokens = text.split(/[\n\r,\s\t]+/).filter(t => t.trim());

  for (const token of tokens) {
    const raw = token.trim();
    if (!raw) continue;

    const domain = normalizeDomainInput(raw);
    if (!domain) {
      invalid.push(raw);
      continue;
    }

    if (seen.has(domain)) {
      duplicate.push(domain);
    } else {
      seen.add(domain);
      valid.push(domain);
    }
  }

  return { valid, duplicate, invalid };
}
