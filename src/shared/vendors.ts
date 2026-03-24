/**
 * Vendor false-positive dispute contacts.
 * Sources:
 * - https://docs.virustotal.com/docs/false-positive-contacts
 * - https://github.com/yaronelh/False-Positive-Center
 */

export interface VendorContact {
  url?: string;
  email?: string;
}

// Vendors with web forms get priority; email-only as fallback
const VENDORS: Record<string, VendorContact> = {
  // --- Web form vendors (priority) ---
  'Google Safebrowsing': { url: 'https://safebrowsing.google.com/safebrowsing/report_error/?hl=en' },
  'Kaspersky': { url: 'https://opentip.kaspersky.com/', email: 'newvirus@kaspersky.com' },
  'ESET': { url: 'https://support.eset.com/kb141/?page=content&id=SOLN141', email: 'samples@eset.com' },
  'BitDefender': { url: 'https://www.bitdefender.com/consumer/support/answer/40673/', email: 'virus_submission@bitdefender.com' },
  'Avast': { url: 'https://www.avast.com/report-false-positive', email: 'DL-Virus@gendigital.com' },
  'Fortinet': { url: 'https://www.fortiguard.com/faq/classificationdispute' },
  'Sophos': { url: 'https://support.sophos.com/support/s/filesubmission', email: 'samples@sophos.com' },
  'Trend Micro': { url: 'https://www.trendmicro.com/en_us/about/legal/detection-reevaluation.html', email: 'virus@trendmicro.com' },
  'Microsoft': { url: 'https://www.microsoft.com/en-us/wdsi/filesubmission' },
  'McAfee': { url: 'https://www.mcafee.com/en-us/consumer-support/dispute-detection-allowlisting.html', email: 'virus_research@mcafee.com' },
  'Symantec': { url: 'https://symsubmit.symantec.com/', email: 'false.positives@broadcom.com' },
  'Netcraft': { url: 'https://report.netcraft.com/report/mistake' },
  'Malwarebytes': { url: 'https://support.malwarebytes.com/hc/en-us/articles/360038524154' },
  'ClamAV': { url: 'https://www.clamav.net/reports/fp' },
  'Emsisoft': { url: 'https://www.emsisoft.com/en/support/contact/', email: 'fp@emsisoft.com' },
  'Avira': { url: 'https://www.avira.com/en/analysis/submit-url' },
  'F-Secure': { url: 'https://www.withsecure.com/en/support/contact-support/submit-a-sample' },
  'WithSecure': { url: 'https://www.withsecure.com/en/support/contact-support/submit-a-sample' },
  'G Data': { url: 'https://www.gdata.de/help/en/general/GeneralInformation/submitFileAppURL/' },
  'Dr.Web': { url: 'https://vms.drweb.com/sendvirus/', email: 'vms@drweb.com' },
  'Spamhaus': { url: 'https://www.spamhaus.org/dbl/removal/form/' },
  'Spam404': { url: 'https://www.spam404.com/revision-request-domain.html' },
  'CRDF': { url: 'https://threatcenter.crdf.fr/false_positive.html' },
  'Elastic': { url: 'https://docs.google.com/forms/d/e/1FAIpQLSfKZOPSPcucmgNR9_j316JnG_qYbJBpti5JSsNxQNQtTHjsxw/viewform' },
  'SecureAge': { url: 'https://www.secureaplus.com/features/antivirus/report-false-positive/' },
  'VIPRE': { url: 'https://helpdesk.vipre.com/hc/en-us/requests/new' },
  'Webroot': { url: 'https://www.webroot.com/us/en/business/support/vendor-dispute-contact-us' },
  'Xcitium': { url: 'https://www.comodo.com/home/internet-security/submit.php' },
  'Lionic': { url: 'https://www.lionic.com/reportfp/', email: 'support@lionic.com' },
  'Scumware.org': { url: 'https://www.scumware.org/removals.php' },
  'BforeAi': { url: 'https://bfore.ai/support' },

  // --- Email-only vendors ---
  'Acronis': { email: 'virustotal-falsepositive@acronis.com' },
  'AhnLab': { email: 'v3sos@ahnlab.com' },
  'Alibaba': { email: 'virustotal@list.alibaba-inc.com' },
  'Antiy': { email: 'avlsdk_support@antiy.cn' },
  'Arcabit': { email: 'vt.fp@arcabit.pl' },
  'Baidu': { email: 'bav@baidu.com' },
  'Bkav': { email: 'fpreport@bkav.com' },
  'CMC': { email: 'PSIRT@cmccybersecurity.com' },
  'CrowdStrike': { email: 'VTscanner@crowdstrike.com' },
  'CyanSecurity': { email: 'virustotal@cyansecurity.com' },
  'Cybereason': { email: 'vt-feedback@cybereason.com' },
  'Cynet': { email: 'soc@cynet.com' },
  'Deep Instinct': { email: 'vt-fps-requests@deepinstinct.com' },
  'Ikarus': { email: 'fp@ikarus.at' },
  'K7': { email: 'reportfp@labs.k7computing.com' },
  'Panda': { email: 'falsepositives@pandasecurity.com' },
  'Rising': { email: 'fp@rising.com.cn' },
  'SentinelOne': { email: 'report@sentinelone.com' },
  'Tencent': { email: 'TAVfp@tencent.com' },
  'Trellix': { email: 'datasubmission@trellix.com' },
  'Yandex': { email: 'yandex-antivir@support.yandex.ru' },
  'ZoneAlarm': { email: 'zonealarm_VT_reports@checkpoint.com' },
  'Zoner': { email: 'false@zonerantivirus.com' },

  // Fallback aliases (VT may use different names)
  'Avast-Mobile': { url: 'https://www.avast.com/report-false-positive', email: 'DL-Virus@gendigital.com' },
  'AVG': { url: 'https://www.avg.com/false-positive-file-form', email: 'DL-Virus@gendigital.com' },
  'Palo Alto Networks': { url: 'https://live.paloaltonetworks.com/t5/virustotal/bd-p/VirusTotal_Discussions', email: 'vt-pan-false-positive@paloaltonetworks.com' },
  'Qihoo-360': { email: 'support@360safe.com' },
  'QuickHeal': { email: 'viruslab@quickheal.com' },
  'Sucuri': { email: 'soc@sucuri.net' },
  'Trustwave': { url: 'https://support.trustwave.com/virustotal-detection-review/' },
};

/**
 * Look up vendor contact info. Case-insensitive partial match.
 */
export function getVendorContact(vendorName: string): VendorContact | null {
  // Exact match first
  if (VENDORS[vendorName]) return VENDORS[vendorName];

  // Case-insensitive match
  const lower = vendorName.toLowerCase();
  for (const [key, val] of Object.entries(VENDORS)) {
    if (key.toLowerCase() === lower) return val;
  }

  // Partial match (VT vendor names can vary)
  for (const [key, val] of Object.entries(VENDORS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
  }

  return null;
}
