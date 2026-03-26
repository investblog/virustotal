# VirusTotal Domain Monitor

## Snapshot

v1.0.0 released to Chrome Web Store, Firefox AMO pending, Edge pending.
Repo: github.com/investblog/virustotal | Landing: virustotal.site

Surfaces: `background.ts`, `welcome/`, `sidepanel/` (no separate popup).
Firefox popup fallback reuses `sidepanel.html`; sidebar uses `#sidebar` hash.

## Stack

- WXT `^0.19`, TypeScript `^5.7` strict, ESLint `^9`
- Vanilla DOM, zero runtime dependencies
- Aliases: `@/` → `src/`, `@shared/` → `src/shared/`

## Commands

`npm run dev` / `dev:firefox` / `dev:edge` / `build` / `build:firefox` / `build:edge` / `zip:all` / `check`

## Structure

```text
src/
  entrypoints/
    background.ts
    sidepanel/ (index.html, main.ts, components/)
      components/ (drawer.ts, bulk-add-drawer.ts, dispute-drawer.ts, settings-drawer.ts)
    welcome/ (index.html, main.ts)
  shared/
    types/index.ts, constants.ts, db.ts, vt-client.ts, queue.ts,
    badge.ts, alarm.ts, domain-utils.ts, theme.ts, i18n.ts,
    messaging/ (protocol.ts, index.ts),
    vendors.ts, dispute-templates.ts, bulk-parser.ts, ui-helpers.ts
  assets/css/ (theme.css, components.css)
  public/ (icons/, _locales/en/messages.json)
```

## Storage

- `storage.local`: `domains` (Record<string, DomainRecord>), `api_usage`
- `storage.sync`: `vt_api_key`, `check_interval_hours`, `theme`, `pause_until`, `rescan_policy`, `excluded_domains`

DomainRecord: domain, watchlist, added_at, last_checked, vt_last_analysis_date, vt_stats, vt_vendors, status, disputes, whois

## Key Features (current)

- Watchlist + ad-hoc badge for all domains
- Bulk add with preflight + budget estimate
- Smart Check: rescan policy (never / stale30 / stale7 / always)
- Reanalyze (POST /domains/{domain}/analyse)
- WHOIS parsing from VT response (registrar, dates, NS)
- Dispute drawer: 60+ vendors, templates + AI prompts, status tracking
- Pause mode (1h, auto-resume)
- Exclude list (20 defaults, user-editable)
- Settings drawer (gear icon in header)
- Browser notifications (scoped batch, user-initiated only)
- Footer: domain count badge, queue badge, token counter, Telegram, store link, 301.st

## Queue / Budget

- Priorities: high (user) > normal (watchlist) > low (ad-hoc)
- Budget: ad-hoc blocked at 400, normal at 480, daily max 500
- Throttle: 15s between requests
- Scoped batch tracking: beginManualBatch / trackManualBatchResult / finishManualBatch
- abortQueue() for clean shutdown on errors
- shouldCountApiRequest() — only count real HTTP responses

## Signal Contract

Layer 1: Icon badge — Pause `II` yellow > Queue count blue > Per-tab status
Layer 2: Footer badges — domains, queue (GET_QUEUE_STATUS), tokens (API_USAGE)
Layer 3: Footer progress bar — is-loading during queue/render
Layer 4: Toasts — 4s auto-dismiss
Layer 5: OS notifications — user-initiated batches only
Layer 6: Button states — btn--loading, disabled "Queued"

## Default view

Current Site if active tab has valid domain, otherwise Watchlist.
Settings in gear icon drawer, not in tabs.

## Design References

- **`W:\Projects\301-ui`** — design system: icons (mono/), drawers, tables, fieldsets, copy feedback
- **`W:\Projects\fastweb`** — WXT patterns: messaging, theme, i18n, sidebar/popup
- **`W:\Projects\redirect-inspector`** — drawer factory, analysis cards
- **`W:\Projects\cloudflare-tools`** — bulk parser, IDN policy
- **`W:\Projects\cookiepeak`** — compact tool UI, dense inspector, footer
- **`W:\Projects\debloat`** — pause mode pattern

## Rules

- **No emoji** — SVG icons from 301-ui mono or Pictogrammers MDI, add to sprite
- Keep AGENTS.md, CLAUDE.md, ROADMAP.md aligned with code
- SPEC.md = v1 product contract
- ROADMAP.md = future work
- VT API key in temp/vt-api-key.txt (gitignored)
