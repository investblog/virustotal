/**
 * Generate dispute text for a false positive report.
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

/**
 * Generate an AI prompt for crafting a dispute letter.
 * User copies this and pastes into any AI chat.
 */
export function generateAiPrompt(
  vendorName: string,
  domain: string,
  category: string,
): string {
  return [
    `Write a professional false positive dispute email to ${vendorName}.`,
    '',
    `Context:`,
    `- Domain: ${domain}`,
    `- Flagged as: ${category}`,
    `- This is a legitimate website, the detection is a false positive`,
    `- VirusTotal report: https://www.virustotal.com/gui/domain/${domain}`,
    '',
    `Requirements:`,
    `- Professional, concise tone`,
    `- Include the domain name and VT report link`,
    `- Request review and removal of the false detection`,
    `- Keep it under 150 words`,
  ].join('\n');
}
