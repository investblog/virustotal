# VirusTotal Domain Monitor — Roadmap

---

## v1.0 — MVP (current)

Базовый мониторинг доменов через VT API.

- [x] Watchlist доменов с авто-проверкой по расписанию
- [x] Badge для всех сайтов (с budget guard)
- [x] Side panel: Watchlist / Current Site / Settings
- [x] Welcome wizard (API key + первый домен)
- [x] Stale data overlay (серый badge при VT scan > 30 дней)
- [x] Compact popup mode для Firefox
- [x] Тема dark / light / auto
- [x] i18n-ready (English)

---

## v1.1 — Polish

Фиксы и улучшения по результатам ручного тестирования MVP.

- [ ] Валидация домена в UI с визуальным фидбэком (красная рамка, tooltip)
- [ ] Пустой стейт для Current Site при отсутствии ключа (CTA на setup)
- [ ] Loading-спиннер при проверке домена
- [ ] Relative time auto-refresh (обновлять «2h ago» без перезагрузки)
- [ ] Keyboard shortcut для открытия side panel
- [ ] Edge билд + тестирование

---

## v2.0 — False Positive Resolution

**Ключевая фича:** когда вебмастер видит, что его домен помечен как malicious/suspicious — помочь ему оспорить false positive.

### Что нужно от VT API

Расширить `vt-client.ts`: помимо `last_analysis_stats` парсить `last_analysis_results` — объект с per-vendor вердиктами:

```typescript
// data.attributes.last_analysis_results
// { "Vendor Name": { category: "malicious", result: "Phishing", ... }, ... }

interface VtVendorResult {
  vendor: string;
  category: 'malicious' | 'suspicious' | 'harmless' | 'undetected';
  result: string;       // "Phishing", "Malware", etc.
}
```

Это даёт список конкретных вендоров, которые залистили домен.

### Drawer — «Dispute False Positive»

Слайд-ин панель (паттерн из redirect-inspector):

```
<aside class="drawer">
  <div class="drawer__overlay" />
  <div class="drawer__panel">
    <header>  "example.com — flagged by 3 vendors"  [×]
    <body>
      ┌─ Vendor Card ──────────────────────┐
      │  🔴 Kaspersky — "Phishing"         │
      │  [Open dispute form ↗]             │
      │  [Copy template ⎘]                │
      └────────────────────────────────────┘
      ┌─ Vendor Card ──────────────────────┐
      │  🟡 ESET — "Suspicious"            │
      │  [Open dispute form ↗]             │
      │  [Copy template ⎘]                │
      └────────────────────────────────────┘
      ...
    <footer>
      "Tip: After vendors remove the flag, request a VT rescan."
      [Request rescan]
  </div>
```

### Vendor Database

`src/shared/vendors.ts` — маппинг вендоров на формы для оспаривания:

```typescript
interface VendorInfo {
  name: string;
  disputeUrl: string;       // URL формы false positive
  templateKey: string;       // ключ шаблона обращения
}

// Пример:
{ name: 'Kaspersky', disputeUrl: 'https://opentip.kaspersky.com/', templateKey: 'kaspersky' }
{ name: 'ESET',      disputeUrl: 'https://phishing.eset.com/report', templateKey: 'eset' }
{ name: 'Google Safebrowsing', disputeUrl: 'https://safebrowsing.google.com/safebrowsing/report_error/', templateKey: 'google' }
```

### Шаблоны обращений

`src/shared/dispute-templates.ts` — генератор текста для каждого вендора:

```typescript
function generateDisputeText(vendor: string, domain: string): string
// "Dear [Vendor] team,
//  The domain [domain] has been incorrectly flagged as [category].
//  This is a false positive. The domain is a legitimate website...
//  Please review and remove the listing.
//  VT report: https://www.virustotal.com/gui/domain/[domain]"
```

### UX-флоу

1. Watchlist / Current Site показывает домен с malicious/suspicious статусом
2. Рядом со статусом появляется кнопка **«Dispute →»**
3. Клик → открывается drawer с карточками вендоров
4. Каждая карточка:
   - Название вендора + его вердикт (Phishing, Malware, etc.)
   - **«Open dispute form ↗»** — открывает URL вендора в новой вкладке
   - **«Copy template ⎘»** — копирует готовый текст обращения в буфер
5. Footer: кнопка **«Request VT rescan»** → `POST /domains/{domain}/analyse`

### Файлы для реализации

```
src/shared/
  vendors.ts                    # vendor name → dispute URL mapping
  dispute-templates.ts          # template text generator
  types/index.ts                # +VtVendorResult, VendorInfo

src/entrypoints/sidepanel/
  components/
    dispute-drawer.ts           # createDisputeDrawer() factory
  main.ts                       # +Dispute button в карточках

src/assets/css/
  components.css                # +drawer styles (slide-in, overlay, cards)
```

### Drawer CSS (из redirect-inspector)

```css
.drawer { position: fixed; inset: 0; z-index: 50; display: flex; justify-content: flex-end; }
.drawer__overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.drawer__panel { max-width: 560px; animation: drawerSlideIn 200ms ease-out; }
@keyframes drawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
```

### DOM-хелпер (из redirect-inspector)

```typescript
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string)
```

---

## v2.1 — Rescan API

- [ ] `POST /api/v3/domains/{domain}/analyse` — запрос переобхода VT
- [ ] Кнопка «Request rescan» в drawer и в Current Site (для stale data)
- [ ] Cooldown: не чаще 1 ресканирования в 24 часа на домен
- [ ] Отдельный бюджет: rescan не считается в основные 500 req/day

---

## v2.2 — Vendor Intelligence

- [ ] Обогащение vendor database: 50+ вендоров с dispute URLs
- [ ] Авто-определение типа формы (email / web form / API)
- [ ] Трекинг: какие вендоры уже оспорены (localStorage)
- [ ] Прогресс-бар: «3 of 5 vendors disputed»

---

## v3.0 — Notifications & History

- [ ] Push-уведомления при изменении статуса домена
- [ ] История статусов: таймлайн изменений
- [ ] Экспорт/импорт watchlist (JSON)
- [ ] Локализация: ru, uk, tr, es, de, fr

---

## v3.1 — URL Scanning

- [ ] Проверка конкретных URL (не только доменов)
- [ ] `POST /api/v3/urls` + `GET /api/v3/urls/{id}`
- [ ] Деепскан: проверка всех URL на странице (content script)

---

## Backlog / Ideas

- Telegram-бот для уведомлений
- Свой бэкенд для агрегации (301.st API)
- Множественные API-ключи (team mode)
- Dashboard с графиками репутации
- Интеграция с Google Search Console (site verification)
- Платный tier с премиум VT ключом

---

## Next in Line — DMCA Abuse Monitor

Отдельное расширение в линейке, тот же стек (WXT + vanilla DOM), та же архитектура watchlist + drawer.

**Суть:** мониторинг DMCA-злоупотреблений против доменов вебмастера.

**Источники данных:**
- **Lumen Database** (`lumendatabase.org`) — API для поиска DMCA/cease & desist notices по домену
- **Google Transparency Report** — публичные данные по DMCA takedown requests в поиске
- **Google Search Console** — уведомления о removals (требует верификацию владельца)

**Функциональность:**
- Watchlist доменов (переносим паттерн)
- Фоновый мониторинг Lumen API по расписанию
- Badge/алерт: «На ваш домен подана DMCA жалоба»
- Drawer с деталями жалобы: кто подал, на какой контент, дата
- Counter-notice шаблон (+ AI-генерация через Anthropic API)
- История жалоб по домену

**Переносится из VT Monitor:**
- Скелет проекта, WXT config, тема, i18n, messaging protocol
- Side panel layout (tabs, domain cards, settings)
- Welcome wizard (API key → first domain)
- Drawer pattern (из v2.0)
- Budget/throttle механика (адаптировать под Lumen API limits)
