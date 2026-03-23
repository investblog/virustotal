# VirusTotal Domain Monitor

## Current State
- WXT project scaffold is in place: `wxt.config.ts`, `package.json` (with dev/build/zip scripts), `tsconfig.json`, `eslint.config.mjs`.
- Dependencies installed (`node_modules/`), git initialized.
- No `src/` directory yet — no entrypoints, shared modules, CSS, or icons.
- Product spec is in `SPEC.md` (draft, under review).
- Implementation has not started. When it does, create `src/` from scratch following the planned structure below.

## Product Positioning
- Browser extension for webmasters to monitor domain reputation via VirusTotal API.
- Target browsers for v1: Chrome, Firefox, Edge.
- Chrome Web Store category: Developer Tools.
- This is not an antivirus, blocker, navigation warning system, or mass-market security product.

## Source Of Truth
- `SPEC.md` is the main product spec and discussion log.
- `AGENTS.md` is the working contract for coding agents: repo reality, implementation defaults, and decision rules.
- `CLAUDE.md` is the concise technical reference auto-loaded into every conversation context.
- `W:\Projects\fastweb` is the primary architecture/style reference for WXT structure, messaging, CSS tokens, and sidebar handling.
- If `SPEC.md` and the actual repo state differ, do not paper over the mismatch. Call it out and update docs before coding around it.

## How To Work In This Repo
- Treat the project as spec-first until real code exists.
- Prefer clarifying product and architecture decisions before generating large amounts of code.
- Separate accepted decisions from open questions.
- When a product decision is finalized, update `SPEC.md`.
- Update `AGENTS.md` only when the decision changes implementation rules, defaults, or agent workflow.
- When the spec contains contradictory guidance, do not silently pick a side. Raise it during discussion or record the chosen resolution explicitly.

## Stack
- WXT `^0.19`
- TypeScript `^5.7` with `strict: true`
- ESLint `^9` + `typescript-eslint`
- Vanilla DOM UI only
- No `any`
- No runtime dependencies unless clearly justified
- Use `browser.*` APIs via WXT polyfills
- Path aliases:
  - `@shared/` -> `src/shared/`
  - `@/` -> `src/`

## Planned Project Structure
Target structure after implementation starts:

```text
src/
  entrypoints/
    background.ts
    welcome/
      index.html
      main.ts
    sidepanel/
      index.html
      main.ts
  shared/
    types/index.ts
    constants.ts
    vt-client.ts
    queue.ts
    db.ts
    badge.ts
    alarm.ts
    theme.ts
    messaging/
      index.ts
      protocol.ts
  assets/css/
    theme.css
    components.css
  public/
    icons/
```

By default, do not create a separate `popup/` entrypoint. Reuse `sidepanel/` in a compact popup mode for Firefox fallback if needed.

## Storage Defaults
- Use `browser.storage.local` for domain records.
- Use `browser.storage.sync` for user settings.
- Planned keys:
  - `storage.local`
    - `domains`: `Record<string, DomainRecord>`
  - `storage.sync`
    - `vt_api_key`
    - `check_interval_hours`
    - `theme`
- Keep watchlist domain records in `local`, not `sync`, unless the user explicitly changes this product decision.

## VirusTotal Rules
- v1 uses only `GET https://www.virustotal.com/api/v3/domains/{domain}`.
- Authenticate with `x-apikey`.
- Respect free-tier limits:
  - 4 requests/minute
  - 500 requests/day
- Default throttle strategy: one request every 15 seconds.
- Use `data.attributes.last_analysis_stats` as the basis for computed status.
- Status priority should remain:
  - `malicious`
  - `suspicious`
  - `clean`
  - `unknown`
  - `pending`

## Architecture Defaults
- The background service worker owns:
  - VT request queue
  - alarm scheduling
  - badge updates
  - typed message handling
- UI contexts should react to storage changes instead of maintaining duplicated source-of-truth state where possible.
- Typed messaging belongs in `src/shared/messaging/protocol.ts`.
- Theme behavior belongs in shared utilities plus CSS custom properties.
- MV3 service workers are ephemeral. An in-memory queue is acceptable as a transient worker buffer, but correctness must be reconstructible from storage plus alarms.

## Browser-Specific Rules
- Chrome/Edge:
  - use `sidePanel`
  - toolbar click should open the side panel
  - no consumer-style default popup
- Firefox:
  - use the sidepanel UI as the primary surface
  - if popup fallback is needed, reuse the same sidepanel UI in a compact mode instead of creating a separate popup product
  - a mode flag such as `#sidebar`, `?popup=1`, or equivalent is acceptable to distinguish contexts
- Keep permissions narrow:
  - `storage`
  - `alarms`
  - `tabs`
  - `activeTab`
  - `sidePanel` only where supported
- Keep host permissions limited to `https://www.virustotal.com/*`.
- Do not add `webRequest`, `declarativeNetRequest`, or `<all_urls>`.

## Product Defaults For v1
- Watchlist is the core feature.
- Badge is a compact status indicator, not a fear-based warning UI.
- Background checks are schedule-driven and watchlist-driven.
- No blocking, interception, or navigation warnings.
- No backend/proxy, notifications bot, history tracking, multiple API keys, URL scanning, or import/export in v1.
- Reuse FastWeb patterns where they fit, but do not copy unrelated product behavior.

## Decisions Currently Favored
Use these defaults unless the user explicitly changes the spec:

- Keep domain records in `storage.local`; keep settings in `storage.sync`.
- Chrome/Edge should open the side panel from the extension icon.
- Do not create a separate `popup/` entrypoint by default; Firefox fallback should reuse the sidepanel UI in compact mode.
- Badge works for ALL domains: watchlist auto-refreshes on schedule, ad-hoc domains are checked on first visit and cached (`watchlist: false`).
- Stale VT data (`vt_last_analysis_date` > 30 days) → gray badge regardless of stats. Show warning in UI.
- Track API usage (`requests_today` + date) in `storage.local`. Show counter in Settings.
- Queue has priorities: `high` (user action) > `normal` (watchlist schedule) > `low` (ad-hoc tab visit).
- UI copy uses `data-i18n` attributes from day one with `_locales/en`. No translations in v1, but i18n-ready.

## Resolved Questions
- **Store name**: VirusTotal Domain Monitor.
- **Badge scope**: all domains, not watchlist-only. Ad-hoc cache on first visit.
- **Stale data**: gray badge if VT scan > 30 days. Rescan API (`POST /analyse`) deferred to v2.
- **i18n**: code is i18n-ready (`data-i18n` + `_locales/en`), no translations shipped in v1.
- **Domains storage**: `storage.local`. Settings in `storage.sync`.

## Build Order
1. Create shared types, constants, storage helpers, VT client, queue, alarm helpers, badge logic, theme helpers, and messaging protocol.
2. Implement `background.ts`.
3. Add shared CSS tokens/components.
4. Implement the welcome flow.
5. Implement the side panel.
6. Add compact Firefox popup fallback behavior inside the sidepanel UI if needed.
7. Add icons and store-facing metadata.
8. Run typecheck, lint, and browser builds before polish work.

## Do Not Do
- Do not present the extension as antivirus software.
- Do not widen permissions without a product reason and explicit review.
- Do not silently introduce backend dependencies or runtime packages.
- Do not assume the planned file tree already exists.
- Do not resolve spec contradictions by guesswork.

## File Ownership
- `CLAUDE.md` and the `memory/` directory are owned by Claude Code (the primary agent). No other agent or tool may read, write, or modify these files. They are out of scope for any sub-agent, linter hook, or automated rewrite.
- `AGENTS.md` is the shared contract. Changes to it require explicit user approval.
- `SPEC.md` is the product spec. Any agent may read it; modifications require user approval.
