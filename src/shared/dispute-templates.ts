/**
 * Generate dispute text for a false positive report.
 * Static templates with variable substitution (v2.0).
 * AI-powered generation deferred to v2.2.
 */

export function generateDisputeText(
  vendorName: string,
  domain: string,
  category: string,
): string {
  return [
    `Dear ${vendorName} team,`,
    '',
    `The domain ${domain} has been flagged as "${category}" in your database. We believe this is a false positive.`,
    '',
    `This is a legitimate website and we request that you review and remove this detection.`,
    '',
    `VirusTotal report: https://www.virustotal.com/gui/domain/${domain}`,
    '',
    'Thank you for your time.',
  ].join('\n');
}

/**
 * Generate mailto: link with pre-filled subject and body.
 */
export function generateMailtoLink(
  email: string,
  vendorName: string,
  domain: string,
  category: string,
): string {
  const subject = encodeURIComponent(`False positive report: ${domain}`);
  const body = encodeURIComponent(generateDisputeText(vendorName, domain, category));
  return `mailto:${email}?subject=${subject}&body=${body}`;
}
