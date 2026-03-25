# VirusTotal Domain Monitor

Browser extension for webmasters to monitor domain reputation via the VirusTotal API.

## Features

- Watchlist with scheduled background checks (12h to 7 days)
- Badge indicator on the extension icon for every site
- Current Site inspector with verdict, stats, WHOIS info
- Bulk add domains from text, URLs, or mixed input
- Smart Check with configurable rescan policy
- False positive dispute workflow with 60+ vendor contacts
- Per-vendor dispute templates and AI prompts
- Pause mode to conserve API quota
- Exclude list for noisy domains
- IDN support (Unicode display, punycode in tooltips)
- Dark, light, and auto theme
- Chrome, Edge, and Firefox support

## Setup

1. Install the extension from your browser's store
2. Get a free API key from [VirusTotal](https://www.virustotal.com/gui/my-apikey)
3. Enter the key in the welcome wizard
4. Add your first domain

## Development

```bash
npm install
npm run dev          # Chrome dev build
npm run dev:firefox  # Firefox dev build
npm run dev:edge     # Edge dev build
npm run build        # Chrome production
npm run build:firefox
npm run build:edge
npm run zip:all      # All browser zips
npm run check        # TypeScript + ESLint
```

## Tech Stack

- [WXT](https://wxt.dev) (Web Extension Tools)
- TypeScript (strict)
- Vanilla DOM (no frameworks)
- Zero runtime dependencies

## Privacy

The extension only communicates with the official VirusTotal API using your own key. No analytics, no telemetry, no third-party services. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)

## Links

- [Website](https://virustotal.site)
- [Telegram](https://t.me/traffic301)
- [Sponsored by 301.st](https://301.st)
