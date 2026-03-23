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

## v1.5 — Drawer Shell + Bulk Add

Drawer как **общий UI-механизм** side panel. Первое применение — Bulk Add.
Это инвестиция: drawer shell переиспользуется в v2.0 (Dispute) и далее.

### Drawer shell

Общий компонент слайд-ин панели (паттерн redirect-inspector):
- `src/entrypoints/sidepanel/components/drawer.ts` — `createDrawer(title, onClose): { aside, body, footer }`
- `src/assets/css/components.css` — `.drawer`, `.drawer__overlay`, `.drawer__panel`, `.drawer__header`, `.drawer__body`, `.drawer__footer`
- DOM-хелпер `el(tag, cls?, text?)` в `src/shared/ui-helpers.ts`
- Slide-in animation, overlay click to close, close button

### Bulk Add Drawer

- Кнопка «Bulk add» в Watchlist → открывает drawer
- Textarea для вставки доменов / URL / произвольного текста
- Live count найденных доменов + preflight:
  - valid / duplicate / already in watchlist / invalid
- Action: `Add only` или `Add + check now`
- Estimate: `Estimated API cost: N requests`
- Парсер доменов: переиспользовать подход из cloudflare-tools

### IDN policy

- Storage и API: ASCII / punycode
- UI: Unicode отображение
- Поиск: матч по обеим репрезентациям
- Ref: `W:\Projects\cloudflare-tools\src\shared\domains\idn.ts`

---

## v1.6 — Research Lists

Эволюция Watchlist → Domains с поддержкой именованных списков.

### Модель

Текущий `watchlist: boolean` → `list_id: string` (default `'watchlist'`):
- `DomainRecord` остаётся VT cache по домену (один на домен)
- Добавляется `list_id` — к какому списку принадлежит
- `'watchlist'` — авто-проверка по расписанию
- Любой другой list_id — research, manual check only

> Many-to-many (ListMembership) — отложено до реальной потребности.
> Пока one domain = one list. Promote из research в watchlist = смена list_id.

### UI

- Таб Watchlist переименовывается в **Domains**
- Dropdown сверху для выбора списка: `Watchlist`, `Auction Batch A`, etc.
- `New list` / `Rename` / `Delete list`
- `Check selected` / `Check unchecked` / `Check first 20` — manual batch actions
- Domains из research lists не участвуют в авто-проверках и ad-hoc badge

### Квота

- Research lists: zero auto-check cost
- Bulk check: только по явному действию + обязательный estimate перед запуском
- Budget model не меняется (400 watchlist / 100 ad-hoc / 480 cap)

### Поддомены

- По умолчанию: registrable domain only (strip subdomain)
- Checkbox «Include subdomains» в Bulk Add drawer для продвинутых

---

## v2.0 — False Positive Resolution

**Ключевая фича:** помочь вебмастеру оспорить false positive.

### VT API

Расширить `vt-client.ts`: парсить `last_analysis_results` — per-vendor вердикты:

```typescript
interface VtVendorResult {
  vendor: string;
  category: 'malicious' | 'suspicious' | 'harmless' | 'undetected';
  result: string;       // "Phishing", "Malware", etc.
}
```

### Dispute Drawer

Переиспользует drawer shell из v1.5:

```
drawer header:  "example.com — flagged by 3 vendors"  [×]
drawer body:
  ┌─ Vendor Card ──────────────────────┐
  │  🔴 Kaspersky — "Phishing"         │
  │  [Open dispute form ↗]             │
  │  [Copy template ⎘]                │
  │  Status: ○ Not disputed            │
  └────────────────────────────────────┘
  ...
drawer footer:
  "After vendors remove flags, request a VT rescan."
  [Request rescan]
```

### Vendor Database

`src/shared/vendors.ts` — 100+ вендоров из VT docs + False-Positive-Center:
- Вендоры с веб-формами: прямая ссылка «Open dispute form ↗»
- Вендоры только с email: `mailto:` ссылка + «Copy template ⎘»

Источники:
- https://docs.virustotal.com/docs/false-positive-contacts
- https://github.com/yaronelh/False-Positive-Center

### Шаблоны обращений

`src/shared/dispute-templates.ts`:
- Базовый: подстановка переменных (vendor, domain, category, VT report URL)
- AI-powered (опционально): toggle в Settings, ключ Anthropic API, Claude Haiku для генерации персонализированного письма

### Dispute Tracking

Lightweight, в `storage.local`:
- Per-vendor иконки статуса: `○ Not disputed` / `◔ Disputed` / `● Resolved`
- Сохраняется рядом с DomainRecord (не отдельная таблица)

### Файлы

```
src/shared/
  vendors.ts                    # vendor → dispute URL / email
  dispute-templates.ts          # template generator (static + AI)
  types/index.ts                # +VtVendorResult, VendorInfo, DisputeStatus

src/entrypoints/sidepanel/
  components/
    dispute-drawer.ts           # createDisputeDrawer() — uses drawer shell
  main.ts                       # +Dispute button в карточках
```

---

## v2.1 — Rescan API

- [ ] `POST /api/v3/domains/{domain}/analyse` — запрос переобхода VT
- [ ] Кнопка «Request rescan» в dispute drawer и в Current Site (для stale data)
- [ ] Cooldown: не чаще 1 ресканирования в 24 часа на домен
- [ ] Отдельный бюджет: rescan не считается в основные 500 req/day

---

## v2.2 — Vendor Intelligence

- [ ] Обогащение vendor database: 50+ веб-форм + 50+ email-контактов
- [ ] Авто-определение типа формы (email / web form)
- [ ] Прогресс-бар: «3 of 5 vendors disputed»
- [ ] AI dispute text generation (Anthropic API, Claude Haiku)

---

## v3.0 — Notifications & History

- [ ] Push-уведомления при изменении статуса домена
- [ ] История статусов: таймлайн изменений
- [ ] Экспорт/импорт доменов и списков (JSON)
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
- Many-to-many list memberships (домен в нескольких списках)

---

## Next in Line — DMCA Abuse Monitor

Отдельное расширение в линейке, тот же стек (WXT + vanilla DOM), та же архитектура.

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
- Drawer shell + components (из v1.5)
- Budget/throttle механика (адаптировать под Lumen API limits)
