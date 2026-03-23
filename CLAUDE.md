# VirusTotal Domain Monitor

## Overview
WXT + TypeScript browser extension (Chrome, Firefox, Edge). Monitors domain reputation via VirusTotal API — watchlist with scheduled background checks + badge indicator for the active tab's domain. Developer tool for webmasters, not a consumer antivirus.

## Source Of Truth
- `SPEC.md` — product spec and discussion log
- `AGENTS.md` — full agent contract: implementation defaults, decision rules, guardrails
- `W:\Projects\fastweb` — architecture/style reference (same stack, messaging, CSS tokens, sidebar handling)

## Current State
WXT scaffold in place (wxt.config.ts, package.json, tsconfig, eslint). No `src/` yet — implementation not started. See `AGENTS.md` for build order.

## Tech Stack
- **WXT** ^0.19, **TypeScript** ^5.7 strict, **ESLint** ^9
- Vanilla DOM (no React/Vue), no runtime dependencies
- `browser.*` APIs via WXT polyfills
- Path aliases: `@/` → `src/`, `@shared/` → `src/shared/`

## Key Commands
- `npm run dev` / `dev:firefox` / `dev:edge` — dev build
- `npm run build` / `build:firefox` / `build:edge` — production build
- `npm run zip:all` — zip all browsers
- `npm run check` — tsc + eslint

## Storage
- **`storage.local`**: `domains` → `Record<string, DomainRecord>`
- **`storage.sync`**: `vt_api_key`, `check_interval_hours`, `theme`

## VT API
```
GET https://www.virustotal.com/api/v3/domains/{domain}
x-apikey: {key}
Rate: 4 req/min, 500 req/day → throttle 1 req/15s
Response: data.attributes.last_analysis_stats → { malicious, suspicious, harmless, undetected }
```

## Badge
| Status | Color | Text |
|--------|-------|------|
| clean | `#22c55e` | `✓` |
| suspicious | `#f59e0b` | `!` |
| malicious | `#ef4444` | `✗` |
| unknown | `#6b7280` | `?` |
| pending | `#3b82f6` | `…` |

Priority: malicious > suspicious > clean. Watchlist-only in v1.

## Key Conventions
- Entrypoint scripts: `main.ts` inside directories
- No separate `popup/` — sidepanel in compact mode for Firefox fallback
- Typed messaging: `src/shared/messaging/protocol.ts`
- Theme: CSS custom properties + `data-theme` attribute
- Service worker queue is in-memory but reconstructible from storage + alarms
- Permissions: `storage`, `alarms`, `tabs`, `activeTab`, `sidePanel` (Chrome/Edge only)
- Host permissions: `https://www.virustotal.com/*` only
