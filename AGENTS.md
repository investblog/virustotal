# VT Domain Monitor

## Overview

WXT + TypeScript browser extension for Chrome, Firefox, and Edge.
It monitors domain reputation via the VirusTotal API: watchlist with scheduled background checks plus a badge for the active tab's domain.
This is a developer tool for webmasters, not a consumer antivirus.

## Current State

- v1.0 is implemented and builds successfully for Chrome, Firefox, and Edge.
- Real code exists in `src/`; do not treat this repo as scaffold-only.
- Main entrypoints today:
  - `background.ts`
  - `welcome/`
  - `sidepanel/`
- There is no separate `popup/` entrypoint.
- Firefox popup fallback reuses `sidepanel.html` in compact mode.
- `ROADMAP.md` contains future work and proposals.
- `SPEC.md` remains the v1 product contract.
- If `SPEC.md`, `ROADMAP.md`, and the current code disagree, call out the mismatch explicitly and update docs before coding around it.

## Source Of Truth

- `SPEC.md` - accepted v1 product behavior and guardrails
- `ROADMAP.md` - planned work and discussion proposals beyond v1
- `AGENTS.md` - current implementation contract for coding agents
- `CLAUDE.md` - short technical snapshot auto-loaded into agent context
- `W:\Projects\fastweb` - reference for WXT structure, CSS system, messaging, and sidepanel patterns
- `W:\Projects\301-ui` - design system: drawers, domain display (IDN, badges), fieldsets, detail grids, copy feedback, bulk operations
- `W:\Projects\redirect-inspector` - drawer factory pattern, analysis cards
- `W:\Projects\cloudflare-tools` - bulk domain parser, IDN policy, live preflight

## Tech Stack

- WXT `^0.19`
- TypeScript `^5.7` with `strict: true`
- ESLint `^9`
- Vanilla DOM UI only
- No runtime dependencies
- `browser.*` APIs via WXT where possible
- `chrome.*` callback storage access is currently used inside low-level helpers
- Path aliases:
  - `@/` -> `src/`
  - `@shared/` -> `src/shared/`

## Current Project Structure

```text
src/
  entrypoints/
    background.ts
    sidepanel/
      index.html
      main.ts
    welcome/
      index.html
      main.ts
  shared/
    alarm.ts
    badge.ts
    constants.ts
    db.ts
    domain-utils.ts
    i18n.ts
    queue.ts
    theme.ts
    vt-client.ts
    messaging/
      index.ts
      protocol.ts
    types/
      index.ts
  assets/css/
    components.css
    theme.css
  public/
    icons/
    _locales/en/messages.json
```

## Key Commands

- `npm run dev`
- `npm run dev:firefox`
- `npm run dev:edge`
- `npm run build`
- `npm run build:firefox`
- `npm run build:edge`
- `npm run zip:all`
- `npm run typecheck`
- `npm run lint`
- `npm run check`

## Storage

### `chrome.storage.local`

- `domains` -> `Record<string, DomainRecord>`
- `api_usage` -> `{ count: number, date: string }`

### `chrome.storage.sync`

- `vt_api_key`
- `check_interval_hours`
- `theme`

## Domain Model

```ts
interface DomainRecord {
  domain: string;
  watchlist: boolean;
  added_at: number;
  last_checked: number;
  vt_last_analysis_date: number | null;
  vt_stats: {
    malicious: number;
    suspicious: number;
    harmless: number;
    undetected: number;
  } | null;
  status: 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'pending';
}
```

Notes:

- `watchlist: true` -> schedule-driven monitoring
- `watchlist: false` -> ad-hoc cache for visited domains
- `stale` is not stored; it is a rendering overlay derived from `vt_last_analysis_date`
- `Remove` currently deletes the record, not demotes it

## Current Product Behavior

- Badge exists for supported active-tab domains
- Watchlist domains auto-refresh on schedule
- Ad-hoc domains are checked on first visit if budget allows
- Ad-hoc results are cached and not auto-refreshed
- Ad-hoc cooldown is 7 days
- `stale` means VT data older than 30 days; badge becomes gray `?`, but underlying verdict remains visible in UI
- Current UI surfaces:
  - Watchlist
  - Current Site
  - Settings
- Welcome flow:
  - intro
  - verify API key
  - add first domain
  - open side panel

## Queue, Budget, and Retry Rules

- Queue is in-memory in the background worker
- Queue priorities:
  - `high` - explicit user actions
  - `normal` - watchlist scheduled refresh
  - `low` - ad-hoc first-visit checks
- Queue dedupe: never enqueue a domain already in queue
- Throttle: `15s` between requests
- Budget model:
  - watchlist reserve: `400`
  - ad-hoc blocked at `>= 400`
  - normal blocked at `>= 480`
  - hard daily maximum tracked against `500`
- `tickWatchlist()` must account for queued backlog, not only completed usage
- `429 rate_limited` must not retry forever:
  - bounded retry count
  - stop queue when daily quota is exhausted
- Storage helpers serialize `domains` and `api_usage` updates to avoid lost writes

## Badge Semantics

| Status | Color | Text |
|---|---|---|
| clean | `#22c55e` | `✓` |
| suspicious | `#f59e0b` | `!` |
| malicious | `#ef4444` | `✗` |
| unknown | `#6b7280` | `?` |
| pending | `#3b82f6` | `…` |
| stale overlay | `#6b7280` | `?` |

## Domain Normalization

- Lowercase
- Strip `www.`
- Ignore unsupported protocols:
  - `chrome:`
  - `chrome-extension:`
  - `edge:`
  - `about:`
  - `moz-extension:`
  - `file:`
  - `data:`
  - `blob:`
- Ignore IPs and `localhost`
- Only `http:` / `https:`
- Keep hostnames, not full URLs
- `normalizeDomainInput()` accepts either bare domains or URLs

## Browser-Specific Rules

### Chrome / Edge

- Use `sidePanel`
- Toolbar click opens the side panel
- No default popup
- Manifest hook rewrites side panel path to `sidepanel.html#sidebar`

### Firefox

- Primary full UI: `sidebar_action.default_panel = sidepanel.html#sidebar`
- Popup fallback: `action.default_popup = sidepanel.html`
- Mode detection uses `location.hash.includes('sidebar')`

## UI And Messaging Conventions

- Typed messaging lives in `src/shared/messaging/protocol.ts`
- Current message types:
  - `CHECK_DOMAIN`
  - `ADD_DOMAIN`
  - `REMOVE_DOMAIN`
  - `CHECK_ALL`
  - `VERIFY_KEY`
  - `GET_QUEUE_STATUS`
  - `OPEN_SIDEPANEL`
- Theme uses CSS custom properties plus `data-theme`
- i18n is `_locales/en` + `src/shared/i18n.ts`
- Sidepanel reacts to storage changes and re-renders from storage-backed state

## When Changing The Product

- Update `SPEC.md` when accepted product behavior changes
- Update `ROADMAP.md` for sequencing, future work, or proposals
- Update `AGENTS.md` and `CLAUDE.md` after structural or behavioral changes that affect day-to-day coding decisions
- Do not leave agent docs describing a pre-implementation repo after code structure changes

## Do Not Do

- Do not present the extension as antivirus software
- Do not add backend dependencies or runtime packages without explicit justification
- Do not widen permissions without review
- Do not add `webRequest`, `declarativeNetRequest`, or broad host permissions
- Do not create a separate popup product without an explicit product decision
- Do not silently replace hostname-based behavior with registrable-domain-only behavior
- Do not resolve spec/roadmap/code contradictions by guesswork
- **Do not use emoji anywhere** — not in code, not in UI, not in select options, not in badge text. Use SVG icons from `W:\Projects\301-ui\static\img\icons-src\mono\` or from [Pictogrammers MDI](https://pictogrammers.com/library/mdi/). Add icons to the SVG sprite in `sidepanel/index.html`. Plain Unicode text symbols (✓ ✗ … — •) in badge text are acceptable; emoji codepoints are not.

## File Ownership

- `AGENTS.md` is the shared agent contract
- `CLAUDE.md` is the concise technical reference
- `SPEC.md` is the product spec
- `ROADMAP.md` is the sequencing and proposal document
- Changes to any of these docs should be deliberate and user-visible
