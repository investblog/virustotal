# Store Listing Package

## Positioning

VirusTotal Domain Monitor is a browser extension for webmasters, agencies, SEOs, hosting teams, and domain operators who need to monitor domain reputation through the official VirusTotal API.

It is not an antivirus, not a blocker, and not a consumer "safe browsing" add-on. It is a focused monitoring tool for people who manage sites and want an operational view of domain reputation.

## Short Description - Chrome / Edge

Monitor domain reputation with your free VirusTotal API key: watchlist, current-site badge, bulk add, reanalyze, and dispute workflow.

## Firefox Summary

VirusTotal Domain Monitor helps webmasters track domain reputation with their own free VirusTotal API key. Add domains to a watchlist, run scheduled checks, inspect the current site, bulk import domains, and work through false positives with vendor-specific dispute links and templates.

## Detailed Description

VirusTotal Domain Monitor gives you a practical, browser-native way to keep an eye on domain reputation without constantly opening VirusTotal by hand.

Add your own domains to a watchlist, let the extension check them on a schedule, and use the extension badge to understand the current site's status at a glance. When a domain is flagged, you can open the record, review vendor verdicts, and start dispute work directly from the side panel.

This extension is designed around the free VirusTotal Public API, so the workflow stays realistic for solo webmasters and small teams. It spaces requests, shows daily usage, supports pause mode, and keeps data locally in the browser.

## Why This Is Different

- Built for domain operators, not for general consumers
- Uses your own VirusTotal API key instead of a third-party backend
- Combines watchlist monitoring with current-site inspection
- Helps with false-positive cleanup through vendor links, templates, and progress tracking
- Keeps data local: no analytics, no telemetry, no external sync service

## Key Features

- Watchlist monitoring for domains you care about
- Scheduled background checks from 12 hours to 7 days
- Current-site view for the active tab's domain
- Badge indicator on the extension icon for quick status checks
- Bulk add from pasted domains, URLs, or mixed text
- Reanalyze flow for stale VirusTotal data
- Configurable rescan policy
- False-positive dispute workflow with vendor contacts, copy-ready templates, and AI prompts
- Per-vendor dispute status tracking: Not disputed, Disputed, Resolved
- Daily API usage counter
- Pause mode to preserve quota
- IDN support with Unicode display
- Dark, light, and auto theme
- Chrome, Edge, and Firefox support

## Built For The Free VirusTotal API

You use your own free VirusTotal Public API key.

Practical points for users:

- Free-tier friendly workflow
- Daily usage counter in the UI
- Request throttling to stay within rate limits
- Bulk "Add + check now" is capped for immediate checks
- Watchlist-first model instead of blind full-history scanning
- Pause mode when you want to conserve budget

This makes the extension useful even if you only have the standard free VirusTotal allowance.

## Typical Use Cases

### 1. Monitor your own domains

Add production domains to the watchlist and let the extension re-check them automatically in the background.

### 2. Review a suspicious domain while browsing

Open a site, glance at the badge, then open Current Site to inspect its latest VirusTotal status.

### 3. Audit a batch of domains

Paste a list of domains or URLs into Bulk Add when onboarding a client portfolio, reviewing redirects, or cleaning up a set of domains after migration.

### 4. Work through false positives

If vendors flag a domain, open the dispute view, copy a ready-made message, follow the vendor link, and track which vendors are disputed or resolved.

### 5. Keep stale results under control

Use reanalyze and rescan policy settings to refresh domains whose VirusTotal data is no longer recent enough.

## Who This Is For

- Webmasters
- Site owners
- Agencies managing multiple domains
- SEO and migration specialists
- Hosting and operations teams
- Domain portfolio operators

## What It Does Not Do

- Does not block websites
- Does not replace antivirus software
- Does not inject warnings into pages
- Does not scan page content
- Does not use its own reputation backend

## Privacy And Permissions

The extension talks only to the official VirusTotal API and stores its data in browser storage.

Permissions in plain English:

- `storage`: save API key, settings, watchlist, and cached results
- `alarms`: run scheduled background checks
- `tabs` and `activeTab`: detect the active tab's domain for badge and Current Site
- `sidePanel`: open the monitor panel in Chromium browsers
- `notifications`: notify after user-initiated check batches
- `host permission for virustotal.com`: send VirusTotal API requests

No analytics. No telemetry. No third-party tracking. No external sync server.

## Setup Notes

1. Create a free account at [VirusTotal](https://www.virustotal.com/).
2. Copy your Public API key.
3. Open the extension and verify the key.
4. Add domains to your watchlist.
5. Choose a check interval and rescan policy.

## Suggested Keywords

- VirusTotal
- domain reputation
- webmaster tools
- domain monitor
- blacklist monitor
- false positive dispute
- site reputation
- VirusTotal API
- domain watchlist

## Screenshot Ideas

1. Watchlist with mixed clean / suspicious / stale domains
2. Current Site inspector card with verdict chip and stats
3. Bulk Add drawer with parsed summary
4. Dispute drawer with vendor actions and template preview
5. Settings screen showing API usage and rescan policy

## Submission Notes

- Category: Developer Tools
- Homepage: https://301.st
- Privacy policy: see `PRIVACY.md`
