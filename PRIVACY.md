# Privacy Policy — VirusTotal Domain Monitor

**Last updated:** March 2026

## Summary

VirusTotal Domain Monitor is a browser extension for webmasters that checks domain reputation via the VirusTotal public API. It runs locally in your browser and does not collect, transmit, or store any personal data on external servers.

## What data does the extension store?

### VirusTotal API key (synced)
Your API key is stored in `chrome.storage.sync` and syncs between your devices through your browser account. The key is only sent to the official VirusTotal API (`www.virustotal.com`) and nowhere else.

### Domain watchlist (local)
Your monitored domains and their check results are stored in `chrome.storage.local`. This data stays on your device and is not synced or transmitted.

### Settings (synced)
Check interval, theme preference, rescan policy, and pause state are stored in `chrome.storage.sync`. This data syncs between your devices through your browser account.

### API usage counter (local)
A daily request counter is stored locally to respect VirusTotal rate limits. No usage data is sent externally.

## Network requests

The extension makes only one type of external request:

**VirusTotal API** (`https://www.virustotal.com/api/v3/`) — Domain reputation checks and rescan requests. Each request includes your API key (provided by you) and the domain name being checked. No other personal data is included.

## What this extension does NOT do

- Does not collect analytics or telemetry
- Does not track browsing history
- Does not inject ads or modify web page content
- Does not communicate with any server other than VirusTotal
- Does not use cookies or fingerprinting
- Does not sell or share any data
- Does not access page content — only reads the URL of the active tab

## Permissions explained

| Permission | Why it's needed |
|-----------|----------------|
| `storage` | Save API key, watchlist, settings |
| `alarms` | Schedule background domain checks |
| `tabs` | Read active tab URL for badge display |
| `activeTab` | Access current tab info for domain detection |
| `sidePanel` | Open the monitoring panel (Chrome/Edge) |
| `notifications` | Notify when batch checks complete |
| `host_permissions: virustotal.com` | API calls to VirusTotal only |

## Third-party services

- **VirusTotal** (`www.virustotal.com`) — domain reputation data, operated by Google/Chronicle

## Changes to this policy

If this privacy policy changes, the updated version will be published in the extension repository.

## Contact

For questions or concerns about privacy: https://301.st
