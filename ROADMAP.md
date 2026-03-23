# VirusTotal Domain Monitor - Roadmap

---

## v1.0 - MVP (current)

Базовый мониторинг доменов через VT API.

- [x] Watchlist доменов с авто-проверкой по расписанию
- [x] Badge для всех сайтов с budget guard
- [x] Side panel: Watchlist / Current Site / Settings
- [x] Welcome wizard: API key + первый домен
- [x] Stale data overlay при VT scan старше 30 дней
- [x] Compact popup mode для Firefox через тот же `sidepanel.html`
- [x] Тема dark / light / auto
- [x] i18n-ready (English)

---

## v1.1 - Polish

Фиксы и улучшения по результатам ручного тестирования MVP.

- [ ] Валидация домена в UI с визуальным фидбэком
- [ ] Пустой state для Current Site при отсутствии API key
- [ ] Loading-спиннер при проверке домена
- [ ] Relative time auto-refresh без перезагрузки
- [ ] Keyboard shortcut для открытия side panel
- [ ] Edge smoke test и store-ready проверка

---

## v1.5 - Drawer Shell + Bulk Add

Статус: proposal for discussion.

Drawer нужен как общий UI-механизм side panel. Первое применение - Bulk Add.
Это инвестиция в общий shell, который потом переиспользуется в v2.0 для dispute flow.

### Drawer shell

Общий компонент slide-in панели:

- `src/entrypoints/sidepanel/components/drawer.ts` - `createDrawer(title, onClose): { aside, body, footer }`
- `src/assets/css/components.css` - `.drawer`, `.drawer__overlay`, `.drawer__panel`, `.drawer__header`, `.drawer__body`, `.drawer__footer`
- `src/shared/ui-helpers.ts` - DOM helper `el(tag, cls?, text?)`
- Slide-in animation, overlay click to close, close button, focus return

### Bulk Add drawer

- Кнопка `Bulk add` в Watchlist/ Domains открывает drawer
- Textarea для вставки доменов, URL и произвольного текста
- Live count найденных доменов + preflight summary:
  - `valid`
  - `duplicate`
  - `already in watchlist`
  - `already in list`
  - `invalid`
- Actions:
  - `Add only`
  - `Add + check now`
- Estimate перед запуском: `Estimated API cost: N requests`
- Парсер доменов: переиспользовать подход из `cloudflare-tools`

### IDN policy

- Storage и API: ASCII / punycode
- UI: Unicode display
- Поиск: матч по Unicode и punycode

### Batch budget policy

Bulk-операции не должны ломать текущую budget model.

- `Add only` не тратит VT quota
- `Add + check now` и будущие batch checks работают только после явного подтверждения estimate
- За один batch по умолчанию проверяем не больше 20 доменов
- Batch checks останавливаются до пересечения watchlist reserve:
  - не расходуют reserved budget после `requests_today >= 400`
  - не queue-ятся за hard cap `480`
- Одиночный `Check now` для конкретного домена остаётся отдельным explicit action и не меняет текущую модель

### References

- `W:\Projects\cloudflare-tools\src\shared\domains\idn.ts`
- `W:\Projects\cloudflare-tools\src\shared\domains\parser.ts`
- `W:\Projects\cloudflare-tools\src\entrypoints\sidepanel\main.ts`

---

## v1.6 - Research Lists

Статус: proposal for discussion.

Эволюция Watchlist -> Domains с поддержкой research lists для due diligence перед покупкой доменов.

### Model

`DomainRecord` остаётся единым VT cache по домену. Принадлежность к спискам хранится отдельно.

- `DomainRecord`
  - один cache row на домен
  - может существовать без membership вообще, если это ad-hoc cache
- `ListRecord`
  - встроенный `watchlist`
  - пользовательские research lists: `Auction Batch A`, `Expired .com`, и т.п.
- `ListMembership`
  - отдельная связь `domain <-> list`
  - модель поддерживает multiple memberships с первого релиза списков
  - UI может начать с простых действий, но storage не должен кодировать membership в `DomainRecord`

Итог:

- Watchlist membership = домен участвует в schedule-driven checks
- Research membership = домен виден в соответствующем списке, но не участвует в auto-check по умолчанию
- Ad-hoc cache остаётся возможным без добавления домена ни в один list

### UI

- Текущий tab `Watchlist` эволюционирует в `Domains`
- List switcher сверху: `Watchlist`, `Auction Batch A`, `Brandables`, и т.д.
- Actions:
  - `New list`
  - `Rename`
  - `Delete list`
  - `Check selected`
  - `Check unchecked`
  - `Check first 20`
- Из research list можно явно:
  - `Add to watchlist`
  - `Remove from list`
- Domains из research lists не попадают в schedule-driven auto-check и не участвуют в badge ad-hoc логике только потому, что они в research list

### Quota

- Research lists по умолчанию стоят `manual-only`
- Любой batch check использует ту же batch budget policy, что и v1.5
- Watchlist reserve остаётся защищённым
- Перед запуском batch user видит estimate и upper bound по числу запросов

### Subdomains

По умолчанию bulk import должен сохранять введённый hostname как есть.

- Default: preserve hostname (`shop.example.com` остаётся `shop.example.com`)
- Optional import mode: `Collapse to registrable domain`
- `www.` по-прежнему нормализуется как сейчас

### Exclude List

Встроенный список исключений для ad-hoc badge — домены, которые не нужно проверять при посещении.

- ~20 предустановленных: google.com, youtube.com, facebook.com, twitter.com, github.com, reddit.com, wikipedia.org, amazon.com, microsoft.com, apple.com, virustotal.com, linkedin.com, instagram.com, stackoverflow.com, etc.
- Пользователь может добавлять свои (шумные домены, внутренние сервисы)
- Пользователь может убирать предустановленные, если хочет мониторить
- Хранение: `storage.sync` (синхронизируется между устройствами)
- Домены из exclude list: пустой badge, не ставятся в ad-hoc очередь
- Watchlist всё равно разрешает добавление исключённых доменов (явное действие)
- UI: секция в Settings → «Excluded domains» с возможностью add/remove + reset to defaults

### Search

- Локальный поиск без сети
- Матч по:
  - domain
  - punycode / Unicode form
  - notes
  - status
  - stale / unchecked filters

---

## v2.0 - False Positive Resolution

Ключевая фича: помочь вебмастеру оспорить false positive.

### VT API

Расширить `vt-client.ts`: парсить `last_analysis_results` с per-vendor verdicts.

```ts
interface VtVendorResult {
  vendor: string;
  category: 'malicious' | 'suspicious' | 'harmless' | 'undetected';
  result: string;
}
```

### Dispute drawer

Переиспользует drawer shell из v1.5:

```text
drawer header: "example.com - flagged by 3 vendors" [x]
drawer body:
  Vendor card
    Kaspersky - "Phishing"
    [Open dispute form]
    [Copy template]
    Status: Not disputed
drawer footer:
  "After vendors remove flags, request a VT rescan."
  [Request rescan]
```

### Vendor database

`src/shared/vendors.ts` - vendor -> dispute URL / email.

Источники:

- [VirusTotal false positive contacts](https://docs.virustotal.com/docs/false-positive-contacts)
- [False-Positive-Center](https://github.com/yaronelh/False-Positive-Center)

### Dispute templates

`src/shared/dispute-templates.ts`

- Базовые шаблоны с подстановкой переменных
- Статический copy-first режим без внешнего AI

AI-генерация текста переносится в v2.2, чтобы не смешивать первый dispute release с настройками стороннего LLM API, privacy review и дополнительной интеграцией.

### Dispute tracking

Lightweight tracking в `storage.local`:

- `Not disputed`
- `Disputed`
- `Resolved`

Хранится рядом с доменом, без отдельной сложной таблицы на первом этапе.

---

## v2.1 - Rescan API

- [ ] `POST /api/v3/domains/{domain}/analyse`
- [ ] Кнопка `Request rescan` в dispute drawer и в Current Site
- [ ] Cooldown: не чаще одного rescаn в 24 часа на домен
- [ ] Отдельный бюджет для rescan, не смешанный с основным daily counter

---

## v2.2 - Vendor Intelligence + AI Assist

- [ ] Обогащение vendor database: web forms + email contacts
- [ ] Авто-определение типа vendor flow: email / web form
- [ ] Progress bar: `3 of 5 vendors disputed`
- [ ] AI dispute text generation:
  - Anthropic API
  - Claude Haiku
  - explicit opt-in в Settings
  - отдельный privacy / copy review

---

## v3.0 - Notifications & History

- [ ] Push-уведомления при изменении статуса домена
- [ ] История статусов: timeline изменений
- [ ] Export / import доменов и списков
- [ ] Localization: ru, uk, tr, es, de, fr

---

## v3.1 - URL Scanning

- [ ] Проверка конкретных URL, не только доменов
- [ ] `POST /api/v3/urls` + `GET /api/v3/urls/{id}`
- [ ] Deep scan: проверка всех URL на странице через content script

---

## Backlog / Ideas

- Telegram-бот для уведомлений
- Свой backend для агрегации
- Multiple API keys / team mode
- Dashboard с графиками репутации
- Интеграция с Google Search Console
- Платный tier с premium VT key
- List notes, tags and saved filters

---

## Next in Line - DMCA Abuse Monitor

Отдельное расширение в линейке на том же стеке: WXT + vanilla DOM + похожая архитектура.

Суть: мониторинг DMCA-злоупотреблений против доменов вебмастера.

### Источники данных

- `lumendatabase.org`
- Google Transparency Report
- Google Search Console

### Функциональность

- Watchlist доменов
- Фоновый мониторинг по расписанию
- Badge / alert на наличие жалобы
- Drawer с деталями жалобы
- Counter-notice шаблоны
- История жалоб по домену

### Что переиспользуется из VT Monitor

- WXT project skeleton
- Theme / i18n / messaging protocol
- Side panel layout
- Welcome wizard
- Drawer shell из v1.5
- Budget / throttle patterns, адаптированные под лимиты нового источника
