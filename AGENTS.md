# VirusTotal Domain Monitor

## Overview
WXT + TypeScript browser extension (Chrome, Firefox, Edge). Monitors domain reputation via VirusTotal API — watchlist with scheduled background checks + badge indicator for the active tab's domain. Developer tool for webmasters, not a consumer antivirus.

## Tech Stack
- **Framework**: WXT ^0.19
- **Language**: TypeScript ^5.7, strict, no `any`
- **Linting**: ESLint ^9 + typescript-eslint
- **UI**: Vanilla DOM (no React/Vue)
- **Storage**: `chrome.storage.local` (domain records), `chrome.storage.sync` (settings)
- **Build**: `npm run build` (Chrome/Edge), `npm run build:firefox`
- **Dev**: `npm run dev` / `npm run dev:firefox` / `npm run dev:edge`

## Project Structure
```
src/
  entrypoints/
    background.ts               # Service worker: VT API queue, alarms, badge
    welcome/                    # Onboarding wizard (3 steps)
      index.html
      main.ts
    popup/                      # Minimal: current domain status + open panel
      index.html
      main.ts
    sidepanel/                  # Main UI: Watchlist / Current Site / Settings
      index.html
      main.ts
  shared/
    types/index.ts              # TypeScript types (DomainRecord, Settings, etc.)
    constants.ts                # Defaults, badge colors, status mappings
    vt-client.ts                # VirusTotal API v3 client (single endpoint)
    queue.ts                    # Throttled request queue (4 req/min, 15s gap)
    db.ts                       # chrome.storage helpers (CRUD for domains + settings)
    badge.ts                    # Badge color/text by domain status
    alarm.ts                    # chrome.alarms helpers
    theme.ts                    # Dark/light/auto theme (CSS vars + data-theme)
    messaging/
      index.ts                  # Re-export
      protocol.ts               # Typed message protocol (RequestMessage, ResponseMap, sendMessage)
  assets/css/
    theme.css                   # CSS custom properties for dark/light themes
    components.css              # Shared UI components (buttons, inputs, toggles)
  public/
    icons/                      # PNG icons (16, 32, 48, 128)
```

## Key Commands
- `npm run dev` — dev build + load unpacked in Chrome
- `npm run build` / `build:firefox` / `build:edge` — production build
- `npm run zip:all` — build + zip all browsers
- `npm run typecheck` — TypeScript check (`npx wxt prepare` first to generate types)
- `npm run lint` — ESLint
- `npm run check` — tsc + eslint combined

## Storage

**`chrome.storage.local`** — domain records (device-local, no size limit):
- `domains` — `Record<string, DomainRecord>` keyed by domain string

**`chrome.storage.sync`** — user settings (synced across devices):
- `vt_api_key` — string, VirusTotal public API key
- `check_interval_hours` — number, default 24
- `theme` — `'dark' | 'light' | 'auto'`

## VT API
```
GET https://www.virustotal.com/api/v3/domains/{domain}
Header: x-apikey: {key}
Rate limit: 4 req/min, 500 req/day (free key)
Response: data.attributes.last_analysis_stats → { malicious, suspicious, harmless, undetected }
```

## Badge Logic
| Status | Color | Text |
|--------|-------|------|
| clean (mal=0, sus=0) | `#22c55e` green | `✓` |
| suspicious (sus>0) | `#f59e0b` yellow | `!` |
| malicious (mal>0) | `#ef4444` red | `✗` |
| unknown / no key | `#6b7280` gray | `?` |
| pending (queued) | `#3b82f6` blue | `…` |

Updated on `tabs.onActivated` + `tabs.onUpdated` — lookup active tab domain in storage.

## Conventions
- Path aliases: `@shared/` → `src/shared/`, `@/` → `src/`
- Entrypoint scripts: `main.ts` inside directories (WXT convention)
- `browser.*` API everywhere — WXT polyfills
- Typed messaging between background ↔ UI (`shared/messaging/protocol.ts`)
- Theme via CSS custom properties + `data-theme` attribute (dark/light/auto)
- No runtime dependencies — only devDependencies
- No `webRequest` / `declarativeNetRequest` — read-only, CWS-friendly

### Browser-specific (wxt.config.ts hooks)
- **Chrome/Edge**: `sidePanel` permission, icon click → `sidePanel.open()`, no default_popup
- **Firefox**: `sidebar_action`, sidepanel.html as popup fallback, `#sidebar` hash to distinguish modes
- **Permissions**: `storage`, `alarms`, `tabs`, `activeTab`, `sidePanel` (Chrome/Edge only)
- **Host permissions**: `https://www.virustotal.com/*`

### Design references
- **FastWeb** (`W:\Projects\fastweb`) — same stack, architecture, CSS system, messaging protocol
- **CookiePeek** — vanilla DOM patterns, dark palette reference

## Spec
Full product specification: [`SPEC.md`](SPEC.md)
