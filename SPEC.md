# VirusTotal Domain Monitor — Спецификация продукта

> Статус: **драфт**, обсуждается с командой

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
- При 500 req/day и интервале 24h: потолок ~500 доменов в watchlist (достаточно для вебмастера)

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
  status: 'clean' | 'suspicious' | 'malicious' | 'stale' | 'unknown' | 'pending';
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

### Ad-hoc проверки (badge для всех сайтов)

При переключении вкладки (`tabs.onActivated`, `tabs.onUpdated`):
1. Извлечь hostname из URL
2. Поиск в `domains` storage:
   - Есть + свежий → показать badge
   - Есть + наш `last_checked` устарел (для watchlist) → показать текущий badge, добавить в очередь
   - Нет → показать `…` (pending), добавить в очередь с низким приоритетом
3. Ad-hoc результат сохраняется с `watchlist: false`, не обновляется автоматически

### Очередь запросов

```
Queue: { domain: string, priority: 'high' | 'normal' | 'low' }[]
в памяти service worker (восстановима: при пробуждении SW заново
собирается из storage.local по last_checked + interval)

Приоритеты:
  high   — добавление из UI / "Check now"
  normal — watchlist авто-обновление по расписанию
  low    — ad-hoc проверка при посещении сайта

Цикл обработки:
  1. pop domain (по приоритету)
  2. GET /api/v3/domains/{domain}
  3. Обновить DomainRecord в storage.local (+ api_usage counter)
  4. Вычислить status: если vt_last_analysis_date > 30 дней → 'stale'
  5. Обновить badge (если домен = активная вкладка)
  6. setTimeout(15000) → следующий
```

### onInstalled
- `reason === 'install'` → `browser.tabs.create({ url: 'welcome/index.html' })`

### Обработка ошибок
- 401 (invalid key) → пометить все pending как unknown, показать badge `?`
- 429 (rate limit) → pause очереди на 60 секунд, retry
- Сетевая ошибка → retry через 30 секунд, макс. 3 попытки на домен

---

## 7. Badge

| Статус | Цвет | Текст | Условие |
|--------|------|-------|---------|
| clean | `#22c55e` зелёный | `✓` | malicious=0 И suspicious=0 И VT scan < 30 дней |
| suspicious | `#f59e0b` жёлтый | `!` | suspicious > 0 И VT scan < 30 дней |
| malicious | `#ef4444` красный | `✗` | malicious > 0 И VT scan < 30 дней |
| stale | `#6b7280` серый | `?` | VT scan > 30 дней назад (данные устарели) |
| unknown | `#6b7280` серый | `?` | нет данных / нет ключа |
| pending | `#3b82f6` синий | `…` | домен в очереди |

**Приоритет вычисления:** pending → stale (если `vt_last_analysis_date` > 30 дней) → malicious → suspicious → clean → unknown.

**Badge работает для ВСЕХ сайтов**, не только watchlist:
- Watchlist домены: статус из кеша, авто-обновление по расписанию
- Любой другой сайт: при первом визите → очередь → проверка → кеш
- Домен не в кеше → `…` (pending) → после проверки badge обновляется

**Триггеры обновления:**
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
  - Кнопка «Remove» (удалить из watchlist)
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

```jsonc
{
  "permissions": ["storage", "alarms", "tabs", "activeTab", "sidePanel"],
  "host_permissions": ["https://www.virustotal.com/*"],
  "side_panel": { "default_path": "sidepanel.html" }
}
```

- `sidePanel` — только Chrome/Edge, для Firefox удаляется в wxt.config.ts hook
- `host_permissions` только на VT API — не `<all_urls>`
- Без `webRequest`, без `declarativeNetRequest` → чистый CWS review
- Firefox: `sidebar_action` + `browser_specific_settings.gecko`

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

### Q5: Stale data → **серый badge**
Если `vt_last_analysis_date` > 30 дней — badge серый (`?`), в UI предупреждение «VT data is over 30 days old». Запрос переобхода (`POST /analyse`) — в v2.
