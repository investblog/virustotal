# VirusTotal Domain Monitor

## Snapshot

v1.0 is implemented.
Current extension surfaces:

- `background.ts`
- `welcome/`
- `sidepanel/`

There is no separate `popup/` entrypoint.
Firefox popup fallback reuses `sidepanel.html`; full sidebar mode uses `sidepanel.html#sidebar`.

## Stack

- WXT `^0.19`
- TypeScript `^5.7`, strict
- ESLint `^9`
- Vanilla DOM
- No runtime dependencies
- Aliases:
  - `@/` -> `src/`
  - `@shared/` -> `src/shared/`

## Commands

- `npm run dev`
- `npm run dev:firefox`
- `npm run dev:edge`
- `npm run build`
- `npm run build:firefox`
- `npm run build:edge`
- `npm run zip:all`
- `npm run check`

## Current Structure

```text
src/
  entrypoints/
    background.ts
    sidepanel/
    welcome/
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
    types/
  assets/css/
    components.css
    theme.css
  public/
    icons/
    _locales/en/messages.json
```

## Storage

- `storage.local`
  - `domains`
  - `api_usage`
- `storage.sync`
  - `vt_api_key`
  - `check_interval_hours`
  - `theme`

`DomainRecord` is still:

- `domain`
- `watchlist`
- `added_at`
- `last_checked`
- `vt_last_analysis_date`
- `vt_stats`
- `status`

`stale` is computed, not stored.

## Behavior

- Watchlist domains are checked on schedule
- Badge exists for supported active-tab domains
- Ad-hoc checks happen on first visit, are budget-gated, and cache results
- Ad-hoc cooldown is 7 days
- Status model: `clean | suspicious | malicious | unknown | pending`
- Stale overlay: VT data older than 30 days renders as gray `?`

## Budget / Queue

- Watchlist reserve: `400`
- Ad-hoc blocked at `>= 400`
- Normal queue blocked at `>= 480`
- Daily max tracked against `500`
- Throttle: `15s`
- Queue is in-memory, deduped, priority-ordered
- `429` retry is bounded and stops when daily quota is exhausted
- Storage writes for `domains` and `api_usage` are serialized in `db.ts`

## Browser Behavior

- Chrome / Edge:
  - `sidePanel`
  - icon click opens panel
  - no popup
- Firefox:
  - sidebar is primary
  - popup fallback uses same sidepanel UI
  - mode detection via `location.hash.includes('sidebar')`

## Messaging

`src/shared/messaging/protocol.ts`

- `CHECK_DOMAIN`
- `ADD_DOMAIN`
- `REMOVE_DOMAIN`
- `CHECK_ALL`
- `VERIFY_KEY`
- `GET_QUEUE_STATUS`
- `OPEN_SIDEPANEL`

## Notes

- `SPEC.md` is the v1 product contract
- `ROADMAP.md` is for future work and proposals
- Keep `AGENTS.md` and `CLAUDE.md` aligned with actual code after structural changes
