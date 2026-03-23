# VirusTotal Domain Monitor — Спецификация продукта

> Статус: **ready** — все открытые вопросы решены, ревью пройден

---

## 1. Продукт

Браузерное расширение для вебмастеров: мониторинг репутации своих доменов через VirusTotal API.

**Что делает:**
- Watchlist доменов с автоматической фоновой проверкой по расписанию
- Badge на иконке расширения — цветовой индикатор статуса текущего сайта
- Side panel с детальной информацией и управлением
- Онбординг-визард для настройки API-ключа

**Чем не является:**
- Не антивирус, не блокировщик, не предупреждения при навигации
- Не секьюрити-продукт для массового пользователя
- Инструмент вебмастера — живёт рядом с Redirect Inspector, Geo Tier Builder, CookiePeek

**CWS-категория:** Developer Tools

---

## 2. Целевая аудитория

Вебмастера и владельцы сайтов, которым нужно:
- Следить, не попали ли их домены в чёрные списки антивирусов
- Видеть статус своих доменов через badge на иконке расширения
- Иметь единую панель мониторинга без необходимости вручную проверять каждый домен на VirusTotal

---

## 3. Конкуренты

| Расширение | Что делает | Наше отличие |
|---|---|---|
| VirusTotal URL Scanner `glhjgodpcooejchnadnlhifaeokhfncc` | Проверка текущего URL по запросу | Watchlist + автопроверки + badge |

---

## 4. VirusTotal API

```
GET https://www.virustotal.com/api/v3/domains/{domain}
Header: x-apikey: {user_key}
```

**Лимиты бесплатного ключа:**
- 4 запроса/мин
- 500 запросов/день
- 15 500 запросов/месяц

**Поля из ответа:**
- `data.attributes.last_analysis_stats` → `{ malicious, suspicious, harmless, undetected }`
- `data.attributes.last_analysis_date` → timestamp последней проверки VT

**Throttle-стратегия:**
- 1 запрос каждые 15 секунд → укладываемся в 4 req/min

**Budget-модель (500 req/day):**
- Watchlist резерв: 400 req/day — автопроверки по расписанию всегда проходят
- Ad-hoc лимит: 100 req/day — проверки при посещении сайтов
- При `requests_today >= 400`: блокировать ad-hoc (low priority), разрешать watchlist + user-initiated
- При `requests_today >= 480`: только explicit "Check now" по клику пользователя
- Счётчик сбрасывается в полночь UTC

---

## 5. Хранилище

### chrome.storage.local — данные доменов

```typescript
// Ключ: "domains"
// Значение: Record<string, DomainRecord>

interface DomainRecord {
  domain: string;              // ключ
  watchlist: boolean;          // true = в watchlist (авто-проверки), false = ad-hoc кеш
  added_at: number;            // timestamp добавления
  last_checked: number;        // timestamp нашей последней проверки, 0 = не проверялся
  vt_last_analysis_date: number | null;  // timestamp последнего обхода VT (из ответа API)
  vt_stats: {
    malicious: number;
    suspicious: number;
    harmless: number;
    undetected: number;
  } | null;
  status: 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'pending';
  // 'stale' — НЕ хранится в status. Вычисляется при рендеринге badge:
  // if (vt_last_analysis_date && Date.now() - vt_last_analysis_date > 30 days) → stale
}

// Ключ: "api_usage"
// Значение: { count: number, date: string }
// count — запросов сегодня, date — ISO-дата (YYYY-MM-DD) для сброса в полночь UTC
```

### chrome.storage.sync — настройки

```typescript
// Отдельные ключи в sync storage:
// "vt_api_key"            → string
// "check_interval_hours"  → number (default: 24)
// "theme"                 → 'dark' | 'light' | 'auto'
```

**Два типа записей в domains:**
- `watchlist: true` — домены пользователя, авто-проверка по расписанию
- `watchlist: false` — ad-hoc кеш (проверены при посещении), не обновляются автоматически

**Жизненный цикл DomainRecord:**
- **Add to watchlist** (UI / welcome): создать запись `watchlist: true`, поставить в очередь high
- **Ad-hoc cache** (tab switch): создать запись `watchlist: false`, поставить в очередь low
- **Promote** (кнопка «Add to watchlist» в Current Site): `watchlist: false → true`
- **Remove from watchlist** (кнопка «Remove»): удалить запись целиком. При повторном визите создастся свежий ad-hoc
- **Check now** (кнопка): переставить в очередь high, не менять watchlist флаг

**Почему не IndexedDB:**
- Нет рантайм-зависимости (`idb`)
- `chrome.storage` даёт `onChanged` listener → реактивное обновление UI
- `storage.local` не имеет ограничения по размеру
- Паттерн проверен в FastWeb
- Для <1000 доменов `Record<string, DomainRecord>` достаточно

**Почему разделение local/sync:**
- Settings в sync → API-ключ и настройки доступны на всех устройствах
- Домены в local → результаты проверок устройство-специфичны (VT статусы меняются, нет смысла синхронизировать)

---

## 6. Фоновая логика (background.ts)

### Алармы
```
chrome.alarms.create('watchlist-tick', { periodInMinutes: 60 })
```

Каждый час alarm проверяет: какие домены из watchlist (`watchlist: true`) имеют `last_checked + interval_hours < now` → добавляет их в очередь.

### Нормализация доменов

При извлечении hostname из URL активной вкладки:
- Lowercase
- Strip `www.` prefix (`www.example.com` → `example.com`)
- Только hostname (без порта, пути, протокола)
- IDN/punycode: нормализовать в ASCII-форму (VT API принимает только ASCII)
- **Игнорировать (badge пустой, не ставить в очередь):**
  - `chrome://`, `chrome-extension://`, `edge://`, `about:`, `moz-extension://`
  - `file://`, `data:`, `blob:`
  - IP-адреса (`192.168.x.x`, `127.0.0.1`, IPv6)
  - `localhost`

### Ad-hoc проверки (badge для всех сайтов)

При переключении вкладки (`tabs.onActivated`, `tabs.onUpdated`):
1. Нормализовать hostname (см. выше). Если unsupported → badge пустой, выход.
2. Поиск в `domains` storage:
   - Есть → показать badge по текущему status
   - Нет → показать `…` (pending), поставить в очередь low (если бюджет позволяет)
3. **Dedup:** не ставить в очередь, если домен уже в очереди
4. **Cooldown:** не ставить ad-hoc, если `last_checked` < 7 дней назад
5. **Budget gate:** не ставить ad-hoc, если `requests_today >= 400`
6. Если budget/cooldown не позволяет → показать `?` (unknown), не ставить в очередь

### Очередь запросов

```
Queue: { domain: string, priority: 'high' | 'normal' | 'low' }[]
в памяти service worker (восстановима: при пробуждении SW заново
собирается из storage.local по last_checked + interval)

Приоритеты:
  high   — "Check now" из UI, добавление в watchlist
  normal — watchlist авто-обновление по расписанию
  low    — ad-hoc проверка при посещении сайта

Guards перед добавлением:
  - Dedup: домен уже в очереди → пропустить
  - Budget: requests_today >= 400 → блокировать low
  - Budget: requests_today >= 480 → блокировать low + normal
  - Cooldown: ad-hoc с last_checked < 7 дней → пропустить

Цикл обработки:
  1. sort по приоритету, pop первый
  2. GET /api/v3/domains/{domain}
  3. Обновить DomainRecord в storage.local
  4. Инкрементировать api_usage counter
  5. Вычислить status из vt_stats (clean/suspicious/malicious)
  6. Обновить badge (если домен = активная вкладка)
  7. setTimeout(15000) → следующий
```

### onInstalled
- `reason === 'install'` → `browser.tabs.create({ url: 'welcome/index.html' })`

### Обработка ошибок
- 401 (invalid key) → пометить все pending как unknown, показать badge `?`
- 429 (rate limit) → pause очереди на 60 секунд, retry
- Сетевая ошибка → retry через 30 секунд, макс. 3 попытки на домен

---

## 7. Badge

**`status` в DomainRecord** хранит последний verdict от VT:

| status | Цвет | Текст | Условие |
|--------|------|-------|---------|
| clean | `#22c55e` зелёный | `✓` | malicious=0 И suspicious=0 |
| suspicious | `#f59e0b` жёлтый | `!` | suspicious > 0 |
| malicious | `#ef4444` красный | `✗` | malicious > 0 |
| unknown | `#6b7280` серый | `?` | нет данных / нет ключа / unsupported page |
| pending | `#3b82f6` синий | `…` | домен в очереди, ещё не проверен |

**Stale — rendering overlay, не отдельный status:**
Если `vt_last_analysis_date` > 30 дней назад → badge серый `?` вне зависимости от underlying status. В UI (Current Site, Watchlist cards) underlying verdict и stats остаются видны, но с предупреждением «VT data is over 30 days old».

**Приоритет рендеринга badge:**
1. Unsupported page (chrome://, about:, IP...) → пустой badge (без текста и цвета)
2. Нет записи в domains + не в очереди → пустой badge
3. `status === 'pending'` → синий `…`
4. Stale (`vt_last_analysis_date` > 30d) → серый `?`
5. `status === 'malicious'` → красный `✗`
6. `status === 'suspicious'` → жёлтый `!`
7. `status === 'clean'` → зелёный `✓`
8. `status === 'unknown'` → серый `?`

**Badge работает для ВСЕХ доменов** (с budget guard):
- Watchlist: авто-обновление по расписанию
- Ad-hoc: проверка при первом визите (если бюджет позволяет), кеш без авто-обновления
- Бюджет исчерпан → `?` без постановки в очередь

**Триггеры обновления badge:**
- `tabs.onActivated` — переключение вкладки
- `tabs.onUpdated` (status === 'complete') — навигация внутри вкладки
- Завершение проверки домена из очереди

---

## 8. Welcome — онбординг-визард

Открывается автоматически при первой установке.

### Шаг 1/3 — Приветствие
- Название расширения
- Одна строка: что делает
- Кнопка «Get started →»

### Шаг 2/3 — API Key
- Ссылка на `https://www.virustotal.com/gui/my-apikey` (target=_blank)
- Краткая инструкция: зарегистрируйся → скопируй Public API key
- Password-инпут для ключа
- Кнопка «Verify & Save»:
  - Тестовый запрос к VT API (любой домен, например `google.com`)
  - Успех → зелёная галка «Key valid», сохранить в sync storage
  - Ошибка → красный текст «Invalid key — check and try again»
- Нельзя перейти на шаг 3 пока ключ не валидирован

### Шаг 3/3 — Первый домен
- «Add your first domain to watchlist»
- Инпут с placeholder `example.com`
- Кнопка «Add & Check now» → сохранить + отправить в очередь
- Кнопка «Skip» → перейти к финалу
- Финал: «Setup complete! Open Side Panel →»

### UX-детали
- Прогресс-индикатор сверху (шаги 1 → 2 → 3)
- Если ключ уже сохранён (повторное открытие) → шаг 2 пропускается
- Страница доступна повторно из Settings → «Setup guide»

---

## 9. Side Panel — основной UI

Три вкладки, переключение через tab-бар сверху.

### Вкладка: Watchlist
- Список доменов, каждый элемент:
  - Имя домена (моноспейс)
  - Цветная точка статуса
  - Дата нашей проверки (relative: «2h ago», «3 days ago»)
  - Дата обхода VT (если stale: «VT scan: 45 days ago» + предупреждение)
  - Кнопка «Check now» (внеочередная проверка)
  - Кнопка «Remove» (удалить запись целиком; при повторном визите — свежий ad-hoc)
- Форма добавления домена:
  - Инпут с валидацией (формат домена)
  - Кнопка «Add» → сохранить + push в очередь
- Пустое состояние: «No domains yet. Add your first domain above.»

### Вкладка: Current Site
- Hostname текущей активной вкладки
- Статус-блок:
  - Цветной индикатор + текст статуса
  - Breakdown: `Malicious: N / Suspicious: N / Harmless: N / Undetected: N`
  - «Checked: 2h ago» — дата нашей проверки
  - «VT scanned: 12 Mar 2026» — дата обхода VT
  - Если stale: предупреждение «VT data is over 30 days old»
- Кнопка «Check now»
- Кнопка «Add to watchlist» (если домен не в watchlist — промоутит в авто-проверки)
- Если нет данных: «Not checked yet. Click "Check now" to scan.»

Эта же модель данных может использоваться в compact popup-режиме, но без watchlist/settings-элементов и без отдельной сложной навигации.

### Вкладка: Settings
- **API Key:** password-инпут + кнопка «Verify» (тестовый запрос)
- **Check interval:** select `[12h / 24h / 3 days / 7 days]`
- **Theme:** переключатель dark / light / auto
- **API usage:** «142 / 500 requests today» — счётчик квоты (сбрасывается в полночь UTC)
- **Actions:**
  - «Check all now» — форсировать проверку всего watchlist
  - «Setup guide» — повторно открыть welcome page
- **About:** версия расширения, ссылка на store

---

## 10. Popup

Отдельный `popup/` entrypoint в v1 не нужен.

Используем один UI:
- `sidepanel.html` в полном режиме для боковой панели
- тот же `sidepanel.html` в compact popup-режиме как fallback

Содержимое compact popup-режима:
- Hostname текущего сайта
- Цветная точка статуса + текст
- Краткая информация о последней проверке
- Кнопка «Add to watchlist» или «Check now» по контексту
- Кнопка «Open Monitor»
- Если API key не настроен: компактный CTA на setup вместо лишних элементов

Что popup не делает:
- не дублирует Watchlist
- не дублирует Settings
- не становится вторым полноценным интерфейсом

**Chrome/Edge:** popup не нужен — клик по иконке открывает sidePanel напрямую.

**Firefox:** боковая панель остаётся основным режимом. Popup используется только как compact fallback и рендерит тот же UI в упрощённом виде.

---

## 11. Визуальный стиль

CSS-система из FastWeb: theme tokens + components.

### Палитра (dark theme, основная)
```css
--bg:           #111111;
--bg-elevated:  #181A1F;
--bg-soft:      #1F2229;
--text:         #E7E9EE;
--text-muted:   #A0A4AF;
--primary:      #3475C0;
--primary-hover: #4DA3FF;

/* Статусные цвета */
--green:   #22c55e;   /* clean */
--yellow:  #f59e0b;   /* suspicious */
--red:     #ef4444;   /* malicious */
--blue:    #3b82f6;   /* pending */
--gray:    #6b7280;   /* unknown */
```

### Типографика
- UI: system-ui, -apple-system, sans-serif
- Домены: monospace
- Размеры: `--fs-xs` (0.75rem) → `--fs-xl` (1.375rem)

### Компоненты
- Кнопки: `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`
- Инпуты: `.input`, `.field`
- Табы: tab-bar с нижней границей
- Карточки доменов: `.domain-card` с hover-эффектом
- Статусные точки: цветной кружок 8px

---

## 12. Манифест

### Chrome/Edge
```jsonc
{
  "permissions": ["storage", "alarms", "tabs", "activeTab", "sidePanel"],
  "host_permissions": ["https://www.virustotal.com/*"],
  "side_panel": { "default_path": "sidepanel.html#sidebar" },
  "action": { /* no default_popup — icon click → sidePanel.open() via onClicked */ }
}
```

### Firefox
```jsonc
{
  "permissions": ["storage", "alarms", "tabs", "activeTab"],
  "host_permissions": ["https://www.virustotal.com/*"],
  "action": { "default_popup": "sidepanel.html" },
  "sidebar_action": {
    "default_panel": "sidepanel.html#sidebar",
    "default_icon": "icons/icon-48.png"
  },
  "browser_specific_settings": {
    "gecko": { "id": "vt-domain-monitor@example.com" }
  }
}
```

### Режим определения в sidepanel/main.ts
```typescript
const isSidebar = location.hash.includes('sidebar');
// isSidebar → полный UI (3 вкладки)
// !isSidebar → compact popup mode (Current Site only)
```

**Общее:**
- `host_permissions` только на VT API — не `<all_urls>`
- Без `webRequest`, без `declarativeNetRequest` → чистый CWS review
- Манифест генерируется в `wxt.config.ts` hooks (browser-conditional)

---

## 13. Messaging Protocol

Типизированный обмен сообщениями background ↔ UI:

```typescript
// UI → Background
type RequestMessage =
  | { type: 'CHECK_DOMAIN'; domain: string }       // запустить проверку
  | { type: 'ADD_DOMAIN'; domain: string }          // добавить в watchlist + проверить
  | { type: 'REMOVE_DOMAIN'; domain: string }       // удалить из watchlist
  | { type: 'CHECK_ALL' }                           // проверить весь watchlist
  | { type: 'VERIFY_KEY'; key: string }             // валидировать API ключ
  | { type: 'GET_QUEUE_STATUS' }                    // текущее состояние очереди
  | { type: 'OPEN_SIDEPANEL' }                      // открыть side panel (из popup)

// Background → UI (через storage.onChanged)
// UI реактивно обновляется при изменении domains в storage.local
```

---

## 14. Вне скоупа (v1.0)

- ❌ Блокировка переходов / предупреждения при навигации
- ❌ Свой бэкенд / прокси для VT API
- ❌ Push-уведомления / Telegram-бот
- ❌ История изменений статусов (трекинг деградации)
- ❌ Проверка URL (только домены)
- ❌ Запрос переобхода VT (`POST /domains/{domain}/analyse`) — v2, когда stale data
- ❌ Платные фичи / пейволл
- ❌ Множественные API-ключи
- ❌ Экспорт/импорт watchlist
- ❌ Переводы на другие языки (v1 только английский; код i18n-ready — см. Q3)

---

## 15. Порядок разработки

1. ~~`wxt init` → TypeScript шаблон, wxt.config.ts с алиасами~~ ✅ сделано
2. `shared/types/index.ts` — типы DomainRecord, Settings, messages
3. `shared/db.ts` — CRUD для chrome.storage (domains + settings)
4. `shared/vt-client.ts` — VT API клиент + типы ответа
5. `shared/queue.ts` — throttled queue (15s interval)
6. `shared/alarm.ts` — chrome.alarms helpers
7. `shared/badge.ts` — badge color/text логика
8. `shared/messaging/protocol.ts` — typed messages
9. `entrypoints/background.ts` — склейка: алармы + очередь + badge + messaging
10. `shared/theme.ts` + `assets/css/` — тема и компоненты
11. `entrypoints/welcome/` — онбординг (3 шага)
12. `entrypoints/sidepanel/` — основной UI (3 вкладки) + compact popup-mode fallback
13. Тест на реальном VT-ключе, полировка

---

## 16. Решённые вопросы

### Q1: Домены в local vs sync? → **local**
Домены и VT-статусы в `storage.local`. Настройки (ключ, интервал, тема) в `storage.sync`.

### Q2: Badge для сайтов НЕ из watchlist? → **для всех**
Badge работает для всех сайтов. При первом визите домен проверяется и кешируется (`watchlist: false`). Ad-hoc кеш не обновляется автоматически. Watchlist домены обновляются по расписанию.

### Q3: Локализация в v1? → **i18n-ready, English only**
Код сразу на `data-i18n` атрибутах + `_locales/en`. Переводы добавляются позже без рефакторинга.

### Q4: Название → **VirusTotal Domain Monitor**

### Q5: Stale data → **серый badge (rendering overlay)**
`stale` не хранится в `status`. Вычисляется из `vt_last_analysis_date > 30 дней`. Badge серый `?`, в UI предупреждение + underlying verdict остаётся видимым. Запрос переобхода (`POST /analyse`) — в v2.

### Q6: Queue policy → **dedup + cooldown + budget gate**
Dedup перед добавлением в очередь. Ad-hoc cooldown 7 дней. Budget: ad-hoc блокируется при 400 req/day, всё кроме explicit user action — при 480.

### Q7: DomainRecord lifecycle → **Remove = delete**
Add → Promote (ad-hoc → watchlist) → Remove = удалить запись. При повторном визите создаётся свежий ad-hoc.

### Q8: Domain normalization → **lowercase, strip www, skip unsupported**
Unsupported: chrome://, about:, extension pages, IP, localhost, file://. IDN → punycode.
