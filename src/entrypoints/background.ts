import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { QueueItem, DomainRecord } from '@shared/types';
import type { RequestMessage } from '@shared/messaging/protocol';
import { ALARM_NAME, THROTTLE_MS, RETRY, BUDGET, PAUSE_DURATION_MS, STALE_THRESHOLD_MS } from '@shared/constants';
import { extractDomain } from '@shared/domain-utils';
import {
  getDomains, getDomain, saveDomain, removeDomain, saveBulkDomains,
  getWatchlistDomains, getApiKey, saveApiKey,
  getCheckInterval, getApiUsage, incrementApiUsage, resetApiUsageIfNewDay,
  getPauseUntil, setPauseUntil, isPaused,
  getRescanPolicy,
} from '@shared/db';
import { checkDomain, rescanDomain } from '@shared/vt-client';
import { enqueue, dequeue, isQueued, canEnqueue, isInCooldown } from '@shared/queue';
import { createWatchlistAlarm } from '@shared/alarm';
import { computeBadge, computeStatus, BADGE_EMPTY } from '@shared/badge';

export default defineBackground(() => {
  const actionApi: typeof browser.action =
    (browser as any).action || (browser as any).browserAction;

  // --- In-memory queue state ---
  const queue: QueueItem[] = [];
  let processing: string | null = null;
  let queueTimer: ReturnType<typeof setTimeout> | null = null;
  const retryCount = new Map<string, number>();
  let pauseResumeTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Pause ---

  function applyPauseBadge(): void {
    try {
      void actionApi.setBadgeText({ text: ' ' });
      void actionApi.setBadgeBackgroundColor({ color: '#f59e0b' });
    } catch { /* ignore */ }
  }

  async function doPause(): Promise<void> {
    const until = Date.now() + PAUSE_DURATION_MS;
    await setPauseUntil(until);
    if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
    applyPauseBadge();
    scheduleAutoResume(until);
  }

  async function doUnpause(): Promise<void> {
    await setPauseUntil(null);
    if (pauseResumeTimer) { clearTimeout(pauseResumeTimer); pauseResumeTimer = null; }
    try { void actionApi.setBadgeText({ text: '' }); } catch { /* ignore */ }
    scheduleProcessQueue();
  }

  function scheduleAutoResume(until: number): void {
    if (pauseResumeTimer) clearTimeout(pauseResumeTimer);
    const delay = Math.max(0, until - Date.now());
    pauseResumeTimer = setTimeout(() => {
      pauseResumeTimer = null;
      void doUnpause();
    }, delay);
  }

  async function initPause(): Promise<void> {
    const until = await getPauseUntil();
    if (until && until > Date.now()) {
      applyPauseBadge();
      scheduleAutoResume(until);
    } else if (until) {
      await setPauseUntil(null);
    }
  }

  // --- Badge ---

  function applyBadge(tabId: number, badge: { text: string; color: string }): void {
    try {
      if (badge.text) {
        void actionApi.setBadgeText({ text: badge.text, tabId });
        void actionApi.setBadgeBackgroundColor({ color: badge.color, tabId });
      } else {
        void actionApi.setBadgeText({ text: '', tabId });
      }
    } catch { /* ignore */ }
  }

  // Track user-initiated batch operations (not scheduled/ad-hoc)
  let batchProcessed = 0;
  let userInitiatedBatch = false;

  async function notifyQueueComplete(): Promise<void> {
    if (batchProcessed === 0 || !userInitiatedBatch) {
      batchProcessed = 0;
      userInitiatedBatch = false;
      return;
    }
    const count = batchProcessed;
    batchProcessed = 0;
    userInitiatedBatch = false;

    try {
      const domains = await getDomains();
      const all = Object.values(domains).filter(d => d.watchlist);
      const mal = all.filter(d => d.status === 'malicious').length;
      const sus = all.filter(d => d.status === 'suspicious').length;

      let message: string;
      if (mal > 0 || sus > 0) {
        message = `${count} checked: ${mal} malicious, ${sus} suspicious`;
      } else {
        message = `${count} domain${count > 1 ? 's' : ''} checked — all clean`;
      }

      chrome.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icons/icon-128.png'),
        title: 'VT Domain Monitor',
        message,
      });
    } catch { /* ignore — notifications may not be available */ }
  }

  /** Show queue size on badge globally (no tabId = all tabs) */
  async function updateQueueBadge(): Promise<void> {
    const paused = await isPaused();
    if (paused) return; // pause badge takes priority
    const queueSize = queue.length + (processing ? 1 : 0);
    try {
      if (queueSize > 0) {
        void actionApi.setBadgeText({ text: String(queueSize) });
        void actionApi.setBadgeBackgroundColor({ color: '#3b82f6' });
      } else {
        void actionApi.setBadgeText({ text: '' });
      }
    } catch { /* ignore */ }
  }

  async function updateBadgeForTab(tabId: number): Promise<void> {
    let url: string | undefined;
    try {
      const tab = await browser.tabs.get(tabId);
      url = tab.url;
    } catch { return; }

    if (!url) { applyBadge(tabId, BADGE_EMPTY); return; }

    const domain = extractDomain(url);
    if (!domain) { applyBadge(tabId, BADGE_EMPTY); return; }

    const record = await getDomain(domain);
    const queued = isQueued(queue, domain) || processing === domain;
    const badge = computeBadge(record || null, queued);
    applyBadge(tabId, badge);

    // Ad-hoc: enqueue if unknown, not paused, and budget allows
    if (!record && !queued && !(await isPaused())) {
      const usage = await resetApiUsageIfNewDay();
      if (canEnqueue('low', usage) && !isInCooldown(record)) {
        if (enqueue(queue, domain, 'low')) {
          applyBadge(tabId, { text: '\u2026', color: '#3b82f6' });
          scheduleProcessQueue();
        }
      }
    }
  }

  async function refreshActiveBadge(): Promise<void> {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) void updateBadgeForTab(tab.id);
    } catch { /* ignore */ }
  }

  // --- Queue processing ---

  function scheduleProcessQueue(): void {
    if (queueTimer || processing) return;
    void isPaused().then(paused => {
      if (!paused) void processQueue();
    });
  }

  async function processQueue(): Promise<void> {
    if (processing) return;

    const item = dequeue(queue);
    if (!item) {
      queueTimer = null;
      void updateQueueBadge();
      void notifyQueueComplete();
      return;
    }

    processing = item.domain;
    void updateQueueBadge();

    const apiKey = await getApiKey();
    if (!apiKey) {
      processing = null;
      return;
    }

    // Smart Check: decide GET vs POST+GET based on rescan policy
    const policy = await getRescanPolicy();
    const existing = await getDomain(item.domain);
    let needsRescan = false;
    if (policy === 'always') {
      needsRescan = true;
    } else if (policy !== 'never' && existing?.vt_last_analysis_date) {
      const threshold = policy === 'stale7' ? 7 * 24 * 60 * 60 * 1000 : STALE_THRESHOLD_MS;
      needsRescan = (Date.now() - existing.vt_last_analysis_date) > threshold;
    }

    // If rescan needed, POST analyse first (costs 1 extra request), then GET
    if (needsRescan) {
      await rescanDomain(item.domain, apiKey);
      await incrementApiUsage();
    }
    const result = await checkDomain(item.domain, apiKey);

    if (result.ok) {
      retryCount.delete(item.domain);
      const existing = await getDomain(item.domain);
      const status = computeStatus(result.data.stats);
      const record: DomainRecord = {
        domain: item.domain,
        watchlist: existing?.watchlist ?? false,
        added_at: existing?.added_at ?? Date.now(),
        last_checked: Date.now(),
        vt_last_analysis_date: result.data.lastAnalysisDate,
        vt_stats: result.data.stats,
        vt_vendors: result.data.vendors.length > 0 ? result.data.vendors : null,
        status,
        disputes: existing?.disputes,
      };
      await saveDomain(record);
      await incrementApiUsage();
      batchProcessed += 1;
    } else {
      switch (result.error.kind) {
        case 'invalid_key':
          // Stop processing, clear queue
          queue.length = 0;
          processing = null;
          queueTimer = null;
          return;

        case 'rate_limited': {
          await incrementApiUsage();
          const currentUsage = await getApiUsage();
          if (currentUsage.count >= BUDGET.DAILY_MAX) {
            // Daily quota exhausted — stop until tomorrow
            queue.length = 0;
            processing = null;
            queueTimer = null;
            return;
          }
          // Per-minute rate limit — retry once after cooldown
          const rlRetries = (retryCount.get(item.domain) ?? 0) + 1;
          if (rlRetries <= RETRY.MAX_ATTEMPTS) {
            retryCount.set(item.domain, rlRetries);
            enqueue(queue, item.domain, item.priority);
          } else {
            retryCount.delete(item.domain);
          }
          processing = null;
          queueTimer = setTimeout(() => {
            queueTimer = null;
            void processQueue();
          }, RETRY.RATE_LIMIT_DELAY_MS);
          return;
        }

        case 'not_found': {
          retryCount.delete(item.domain);
          const existing = await getDomain(item.domain);
          const record: DomainRecord = {
            domain: item.domain,
            watchlist: existing?.watchlist ?? false,
            added_at: existing?.added_at ?? Date.now(),
            last_checked: Date.now(),
            vt_last_analysis_date: null,
            vt_stats: null,
            vt_vendors: null,
            status: 'unknown',
          };
          await saveDomain(record);
          await incrementApiUsage();
          batchProcessed += 1;
          break;
        }

        case 'network': {
          const attempts = (retryCount.get(item.domain) ?? 0) + 1;
          if (attempts < RETRY.MAX_ATTEMPTS) {
            retryCount.set(item.domain, attempts);
            enqueue(queue, item.domain, item.priority);
          } else {
            retryCount.delete(item.domain);
          }
          processing = null;
          queueTimer = setTimeout(() => {
            queueTimer = null;
            void processQueue();
          }, RETRY.NETWORK_DELAY_MS);
          return;
        }
      }
    }

    // Update badge for active tab if it matches
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const domain = tab.url ? extractDomain(tab.url) : null;
        if (domain === item.domain) {
          void updateBadgeForTab(tab.id);
        }
      }
    } catch { /* ignore */ }

    processing = null;
    void updateQueueBadge();
    queueTimer = setTimeout(() => {
      queueTimer = null;
      void processQueue();
    }, THROTTLE_MS);
  }

  // --- Watchlist tick ---

  async function tickWatchlist(): Promise<void> {
    const interval = await getCheckInterval();
    const intervalMs = interval * 60 * 60 * 1000;
    const now = Date.now();
    const domains = await getWatchlistDomains();
    const usage = await resetApiUsageIfNewDay();

    // Virtual counter: account for already-queued work
    const projectedUsage = { ...usage, count: usage.count + queue.length };

    for (const record of domains) {
      if (now - record.last_checked >= intervalMs) {
        if (canEnqueue('normal', projectedUsage)) {
          if (enqueue(queue, record.domain, 'normal')) {
            projectedUsage.count += 1;
          }
        }
      }
    }
    scheduleProcessQueue();
  }

  // --- Tab listeners ---

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void updateBadgeForTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      void updateBadgeForTab(tabId);
    }
  });

  // --- Alarm ---

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void tickWatchlist();
  });

  // --- onInstalled ---

  // Init pause state on startup
  void initPause();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      try {
        void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
      } catch { /* ignore */ }
    }
    void createWatchlistAlarm();
  });

  // --- Side panel click (Chrome/Edge) ---

  if (!import.meta.env.FIREFOX && actionApi?.onClicked) {
    actionApi.onClicked.addListener((tab) => {
      try {
        const sp = (browser as any).sidePanel;
        if (sp?.open && tab?.id) {
          void sp.open({ tabId: tab.id }).catch(() => {});
        }
      } catch { /* ignore */ }
    });
  }

  // --- Message handler ---

  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'CHECK_DOMAIN': {
          const domain = msg.domain;
          enqueue(queue, domain, 'high');
          scheduleProcessQueue();
          void refreshActiveBadge();
          sendResponse({ ok: true });
          break;
        }

        case 'ADD_DOMAIN': {
          const domain = msg.domain;
          void (async () => {
            const existing = await getDomain(domain);
            const record: DomainRecord = {
              domain,
              watchlist: true,
              added_at: existing?.added_at ?? Date.now(),
              last_checked: existing?.last_checked ?? 0,
              vt_last_analysis_date: existing?.vt_last_analysis_date ?? null,
              vt_stats: existing?.vt_stats ?? null,
              vt_vendors: existing?.vt_vendors ?? null,
              status: existing?.status ?? 'pending',
              disputes: existing?.disputes,
            };
            await saveDomain(record);
            enqueue(queue, domain, 'high');
            scheduleProcessQueue();
            await refreshActiveBadge();
            sendResponse({ ok: true });
          })();
          return true;
        }

        case 'REMOVE_DOMAIN': {
          void (async () => {
            await removeDomain(msg.domain);
            await refreshActiveBadge();
            sendResponse({ ok: true });
          })();
          return true;
        }

        case 'CHECK_ALL': {
          void (async () => {
            userInitiatedBatch = true;
            const domains = await getWatchlistDomains();
            for (const d of domains) {
              enqueue(queue, d.domain, 'high');
            }
            scheduleProcessQueue();
            sendResponse({ ok: true });
          })();
          return true;
        }

        case 'RESCAN_DOMAIN': {
          void (async () => {
            const apiKey = await getApiKey();
            if (!apiKey) { sendResponse({ ok: false, error: 'no_key' }); return; }
            const result = await rescanDomain(msg.domain, apiKey);
            await incrementApiUsage();
            if (result.ok) {
              // Rescan queued at VT — schedule a follow-up check to get fresh data
              enqueue(queue, msg.domain, 'high');
              scheduleProcessQueue();
              await refreshActiveBadge();
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: result.error.kind });
            }
          })();
          return true;
        }

        case 'BULK_ADD': {
          void (async () => {
            if (msg.checkNow) userInitiatedBatch = true;
            const now = Date.now();
            await saveBulkDomains(msg.domains, now);

            if (msg.checkNow) {
              const usage = await resetApiUsageIfNewDay();
              const maxBatch = 20;
              let queued = 0;
              for (const domain of msg.domains) {
                if (queued >= maxBatch) break;
                const projectedCount = usage.count + queue.length + queued;
                if (projectedCount >= BUDGET.HARD_CAP) break;
                if (enqueue(queue, domain, 'high')) queued += 1;
              }
              if (queued > 0) {
                void updateQueueBadge();
                scheduleProcessQueue();
              }
            }
            await refreshActiveBadge();
            sendResponse({ ok: true });
          })();
          return true;
        }

        case 'VERIFY_KEY': {
          void (async () => {
            const result = await checkDomain('google.com', msg.key);
            if (result.ok) {
              await saveApiKey(msg.key);
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: result.error.kind });
            }
          })();
          return true;
        }

        case 'GET_QUEUE_STATUS':
          sendResponse({ length: queue.length, processing });
          break;

        case 'OPEN_SIDEPANEL': {
          if (import.meta.env.FIREFOX) {
            try { (browser as any).sidebarAction.open(); } catch { /* ignore */ }
          } else {
            const sp = (browser as any).sidePanel;
            if (sp?.open) {
              if (sender?.tab?.id) {
                void sp.open({ tabId: sender.tab.id }).catch(() => {});
              } else {
                void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                  if (tab?.id) void sp.open({ tabId: tab.id }).catch(() => {});
                }).catch(() => {});
              }
            }
          }
          break;
        }

        case 'PAUSE': {
          void (async () => {
            await doPause();
            sendResponse({ ok: true });
          })();
          return true;
        }

        case 'UNPAUSE': {
          void (async () => {
            await doUnpause();
            sendResponse({ ok: true });
          })();
          return true;
        }
      }
    }) as (...args: any[]) => void,
  );
});
