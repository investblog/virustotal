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
  domain: string;          // ключ
  added_at: number;        // timestamp добавления
  last_checked: number;    // timestamp последней проверки, 0 = не проверялся
  vt_stats: {
    malicious: number;
    suspicious: number;
    harmless: number;
    undetected: number;
  } | null;
  status: 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'pending';
}
```

### chrome.storage.sync — настройки

```typescript
// Отдельные ключи в sync storage:
// "vt_api_key"            → string
// "check_interval_hours"  → number (default: 24)
// "theme"                 → 'dark' | 'light' | 'auto'
```

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

Каждый час alarm проверяет: какие домены из watchlist имеют `last_checked + interval_hours < now` → добавляет их в очередь.

### Очередь запросов

```
Queue: string[] в памяти service worker
(in-memory, но восстановима: при пробуждении SW заново
собирается из storage.local по last_checked + interval)

Цикл обработки:
  1. pop domain из очереди
  2. GET /api/v3/domains/{domain}
  3. Обновить DomainRecord в storage.local
  4. Обновить badge (если домен = активная вкладка)
  5. setTimeout(15000) → следующий
```

**Приоритет:** при добавлении нового домена через UI → `unshift` в начало очереди (проверяется первым).

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
| clean | `#22c55e` зелёный | `✓` | malicious=0 И suspicious=0 |
| suspicious | `#f59e0b` жёлтый | `!` | suspicious > 0 |
| malicious | `#ef4444` красный | `✗` | malicious > 0 |
| unknown | `#6b7280` серый | `?` | нет данных / нет ключа |
| pending | `#3b82f6` синий | `…` | домен в очереди |

**Приоритет:** malicious > suspicious > clean (если malicious > 0, статус всегда malicious).

**Триггеры обновления:**
- `tabs.onActivated` — переключение вкладки
- `tabs.onUpdated` (status === 'complete') — навигация внутри вкладки
- Завершение проверки домена из очереди

**Логика:** извлечь hostname из URL активной вкладки → найти в `domains` storage → установить badge по статусу. Если домена нет в watchlist → не показывать badge (пустой).

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
  - Дата последней проверки (relative: «2h ago», «3 days ago»)
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
  - Дата последней проверки VT
- Кнопка «Check now»
- Кнопка «Add to watchlist» (если домен ещё не в списке)
- Если нет данных: «Not checked yet. Click "Check now" to scan.»

Эта же модель данных может использоваться в compact popup-режиме, но без watchlist/settings-элементов и без отдельной сложной навигации.

### Вкладка: Settings
- **API Key:** password-инпут + кнопка «Verify» (тестовый запрос)
- **Check interval:** select `[12h / 24h / 3 days / 7 days]`
- **Theme:** переключатель dark / light / auto
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

## 16. Открытые вопросы

> Обсудить с командой перед началом разработки

### Q1: Домены в local vs sync?
Сейчас в спеке: домены в `storage.local`, настройки в `storage.sync`.
**Альтернатива:** домены тоже в sync → watchlist синхронизируется между устройствами (но VT-статусы всё равно устарели).
**Рекомендация:** local. Статусы локальны, sync имеет лимит 100KB.

### Q2: Badge для сайтов НЕ из watchlist?
**Вариант A:** Badge только для доменов из watchlist. Для остальных — пустой.
**Вариант B:** На tab «Current Site» можно запустить проверку любого сайта — результат кешируется, badge обновляется.
**Рекомендация:** v1 — вариант A (проще). Кеширование ad-hoc проверок — в v2.

### Q3: Локализация в v1?
**Вариант A:** Только английский, i18n в v2.
**Вариант B:** Сразу i18n-ready (data-i18n атрибуты, _locales/en), добавить языки позже.
**Рекомендация:** Вариант B — минимальные усилия сейчас, не придётся рефакторить позже.

### Q4: Название для стора
Варианты:
- **VirusTotal Domain Monitor** — текущее рабочее название, точно описывает функцию
- **Domain Guard** — маркетинговее, но может ввести в заблуждение (не guard/блокировщик)
- **VT Watchdog** — запоминается, но неформально
