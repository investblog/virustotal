# User Guide

## What This Extension Does

VirusTotal Domain Monitor helps you monitor domain reputation through the official VirusTotal API from inside your browser.

It is meant for people who manage domains and websites. It is not an antivirus and it does not block sites for you.

## Quick Start

1. Install the extension.
2. Create a free account at [VirusTotal](https://www.virustotal.com/).
3. Copy your Public API key from VirusTotal.
4. Open the extension and verify the key.
5. Add one or more domains to your watchlist.
6. Choose how often watchlist domains should be checked.

## Main Parts Of The UI

### Watchlist

Use Watchlist to manage domains you want to monitor over time.

What you can do there:

- Add one domain manually
- Bulk add many domains at once
- Search the watchlist
- Run a manual check
- Reanalyze stale domains
- Remove domains from the watchlist
- Open the dispute workflow for flagged domains

### Current Site

Current Site shows the domain from the active tab.

Use it to:

- See the current tab's domain status
- Run a manual check
- Add the current domain to the watchlist
- Open the VirusTotal page for that domain

Current Site works with normal website domains. Internal browser pages, `localhost`, and IP-based pages are not supported.

### Settings

Use Settings to:

- Save or update your VirusTotal API key
- Change the watchlist check interval
- Choose a rescan policy
- See daily API usage
- Re-open the setup guide

## Understanding Status Signals

### Extension badge

The extension icon badge gives a quick signal for the active tab's domain:

- `check` clean
- `!` suspicious
- `X` malicious
- `?` unknown or stale
- `...` queued / checking

### Current Site and Watchlist cards

The panel shows a fuller view than the badge:

- the domain
- the verdict
- last check time
- VirusTotal stats
- stale-data hint when the latest VT analysis is old

## Working With The Free VirusTotal API

This extension is designed to work with the free VirusTotal Public API.

Important points:

- You use your own API key
- The free tier has daily and per-minute limits
- The extension spaces requests to stay within those limits
- The UI shows daily API usage
- The usage counter resets at midnight UTC
- Pause mode lets you stop background activity for one hour

### Bulk Add + Check Now

If you choose `Add + check now`, the extension adds all parsed domains to the watchlist, but only starts an immediate limited batch of checks. This helps avoid burning through the free quota too quickly.

The rest of the domains remain in the watchlist and can still be checked later by schedule or by manual action.

## Rescan And Reanalyze

VirusTotal data can become stale.

You have two related tools:

- `Rescan policy`: tells the extension when it should request fresh analysis for older data
- `Reanalyze`: manual action for a stale domain

Reanalyze requests a fresh VirusTotal analysis first, then queues a follow-up check so the UI can pick up updated results.

## False Positive Disputes

When a domain is flagged by vendors, the extension can help you work through false positives.

The dispute drawer gives you:

- vendor-specific contact links when available
- an email shortcut where possible
- a ready-made dispute template
- an AI prompt you can refine elsewhere
- a per-vendor status tracker

Suggested workflow:

1. Open the disputed domain.
2. Review which vendors flagged it.
3. Use the template or AI prompt as a starting point.
4. Submit the vendor form or send the email.
5. Mark each vendor as `Disputed` or `Resolved`.

## Common Workflows

### Monitor your own production domains

Add all important domains to the watchlist and let the extension re-check them on a schedule.

### Audit a client portfolio

Use Bulk Add to paste a set of domains or URLs, then start a limited immediate check batch.

### Check the domain in the active tab

Open a site, glance at the badge, and open Current Site for details.

### Follow up on stale results

Use reanalyze when a domain's VT data is too old to trust at a glance.

### Work through a false positive

Open the dispute drawer, contact vendors, and track progress without leaving the extension workflow.

## Tips For Better Results

- Add only domains you really care about to the watchlist
- Use longer intervals if you are close to the free API limit
- Reserve immediate checks for domains that matter right now
- Use pause mode during low-priority periods
- Review stale domains instead of assuming old verdicts are still accurate

## Troubleshooting

### The badge is empty

Possible reasons:

- the page is not a supported web domain
- the extension is paused
- the domain has not been checked yet
- there is no API key configured

### Current Site says the page type is not supported

This usually means the active tab is:

- an internal browser page
- `localhost`
- an IP address
- a non-web page type such as `file:` or `data:`

### A domain shows `Unknown`

That usually means one of these:

- no result has been fetched yet
- VirusTotal has no useful data for the domain
- your API key is missing or invalid

### A domain shows as stale

The extension still shows the last known verdict, but the latest VirusTotal analysis is old enough that you should treat it as out of date and reanalyze it.

### I reached the daily limit

Wait for the counter to reset at midnight UTC, reduce manual checks, or increase the check interval for your watchlist.

## Privacy

The extension stores its data in browser storage and sends requests only to VirusTotal.

- API key and settings are stored in sync storage
- watchlist and cached results are stored locally
- no analytics or telemetry are collected

For the full policy, see [PRIVACY.md](/W:/Projects/virustotal/PRIVACY.md).
