import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { QueueItem, DomainRecord, DomainStatus } from '@shared/types';
import type { RequestMessage } from '@shared/messaging/protocol';
import { ALARM_NAME, THROTTLE_MS, RETRY, BUDGET, PAUSE_DURATION_MS, STALE_THRESHOLD_MS } from '@shared/constants';
import { extractDomain } from '@shared/domain-utils';
import {
  getDomain, saveDomain, removeDomain, saveBulkDomains,
  getWatchlistDomains, getApiKey, saveApiKey, getExcludedDomains,
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

  const queue: QueueItem[] = [];
  let processing: string | null = null;
  let queueTimer: ReturnType<typeof setTimeout> | null = null;
  const retryCount = new Map<string, number>();
  let pauseResumeTimer: ReturnType<typeof setTimeout> | null = null;

  interface CompletedBatchSummary {
    id: number;
    processed: number;
    malicious: number;
    suspicious: number;
  }

  interface ManualBatchState extends CompletedBatchSummary {
    pending: Set<string>;
  }

  let nextBatchId = 1;
  let activeManualBatch: ManualBatchState | null = null;
  let lastCompletedBatch: CompletedBatchSummary | null = null;

  function applyPauseBadge(): void {
    try {
      void actionApi.setBadgeText({ text: 'II' });
      void actionApi.setBadgeBackgroundColor({ color: '#f59e0b' });
    } catch { /* ignore */ }
  }

  async function doPause(): Promise<void> {
    const until = Date.now() + PAUSE_DURATION_MS;
    await setPauseUntil(until);
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    applyPauseBadge();
    scheduleAutoResume(until);
  }

  async function doUnpause(): Promise<void> {
    await setPauseUntil(null);
    if (pauseResumeTimer) {
      clearTimeout(pauseResumeTimer);
      pauseResumeTimer = null;
    }
    try {
      void actionApi.setBadgeText({ text: '' });
    } catch { /* ignore */ }
    scheduleProcessQueue();
    void refreshActiveBadge();
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

  function beginManualBatch(domains: string[]): void {
    const uniqueDomains = [...new Set(domains)];
    if (!uniqueDomains.length) return;
    if (!activeManualBatch) {
      activeManualBatch = {
        id: nextBatchId++,
        pending: new Set<string>(),
        processed: 0,
        malicious: 0,
        suspicious: 0,
      };
    }
    for (const domain of uniqueDomains) {
      activeManualBatch.pending.add(domain);
    }
  }

  function clearManualBatch(): void {
    activeManualBatch = null;
  }

  function formatBatchMessage(summary: CompletedBatchSummary): string {
    if (summary.malicious > 0 || summary.suspicious > 0) {
      return `${summary.processed} checked: ${summary.malicious} malicious, ${summary.suspicious} suspicious`;
    }
    return `${summary.processed} domain${summary.processed > 1 ? 's' : ''} checked - all clean`;
  }

  async function notifyBatchComplete(summary: CompletedBatchSummary): Promise<void> {
    try {
      chrome.notifications.create(`vt-batch-${summary.id}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icons/icon-128.png'),
        title: 'VT Domain Monitor',
        message: formatBatchMessage(summary),
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn('VT notifications are unavailable:', err.message);
        }
      });
    } catch {
      /* notifications API not available */
    }
  }

  function finishManualBatch(): void {
    if (!activeManualBatch || activeManualBatch.pending.size > 0) return;
    const summary: CompletedBatchSummary = {
      id: activeManualBatch.id,
      processed: activeManualBatch.processed,
      malicious: activeManualBatch.malicious,
      suspicious: activeManualBatch.suspicious,
    };
    activeManualBatch = null;
    if (summary.processed === 0) return;
    lastCompletedBatch = summary;
    void notifyBatchComplete(summary);
  }

  function trackManualBatchResult(domain: string, status: DomainStatus): void {
    if (!activeManualBatch?.pending.has(domain)) return;
    activeManualBatch.pending.delete(domain);
    activeManualBatch.processed += 1;
    if (status === 'malicious') activeManualBatch.malicious += 1;
    if (status === 'suspicious') activeManualBatch.suspicious += 1;
    finishManualBatch();
  }

  function dropManualBatchDomain(domain: string): void {
    if (!activeManualBatch?.pending.has(domain)) return;
    activeManualBatch.pending.delete(domain);
    finishManualBatch();
  }

  function shouldCountApiRequest(
    result: Awaited<ReturnType<typeof checkDomain>> | Awaited<ReturnType<typeof rescanDomain>>,
  ): boolean {
    return result.ok || result.error.kind === 'rate_limited' || result.error.kind === 'not_found';
  }

  let lastBadgeCount = 0;
  function updateQueueBadge(): void {
    const queueSize = queue.length + (processing ? 1 : 0);
    try {
      if (queueSize > 0) {
        if (queueSize !== lastBadgeCount && lastBadgeCount > 0) {
          void actionApi.setBadgeBackgroundColor({ color: '#93c5fd' });
          setTimeout(() => {
            void actionApi.setBadgeBackgroundColor({ color: '#3b82f6' });
          }, 200);
        } else {
          void actionApi.setBadgeBackgroundColor({ color: '#3b82f6' });
        }
        void actionApi.setBadgeText({ text: String(queueSize) });
      } else {
        void actionApi.setBadgeText({ text: '' });
      }
    } catch { /* ignore */ }
    lastBadgeCount = queueSize;
  }

  async function updateBadgeForTab(tabId: number): Promise<void> {
    if (queue.length > 0 || processing) return;

    let url: string | undefined;
    try {
      const tab = await browser.tabs.get(tabId);
      url = tab.url;
    } catch {
      return;
    }

    if (!url) { applyBadge(tabId, BADGE_EMPTY); return; }

    const domain = extractDomain(url);
    if (!domain) { applyBadge(tabId, BADGE_EMPTY); return; }

    const excluded = await getExcludedDomains();
    if (excluded.includes(domain)) { applyBadge(tabId, BADGE_EMPTY); return; }

    const record = await getDomain(domain);
    const queued = isQueued(queue, domain) || processing === domain;
    const badge = computeBadge(record || null, queued);
    applyBadge(tabId, badge);

    const hasKey = !!(await getApiKey());
    if (!record && !queued && hasKey && !(await isPaused())) {
      const usage = await resetApiUsageIfNewDay();
      if (canEnqueue('low', usage) && !isInCooldown(record)) {
        if (enqueue(queue, domain, 'low')) {
          applyBadge(tabId, { text: '\u2026', color: '#3b82f6' });
          updateQueueBadge();
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

  async function abortQueue(): Promise<void> {
    queue.length = 0;
    processing = null;
    retryCount.clear();
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    clearManualBatch();
    updateQueueBadge();
    await refreshActiveBadge();
  }

  function scheduleProcessQueue(): void {
    if (queueTimer || processing) return;
    void isPaused().then((paused) => {
      if (!paused) void processQueue();
    });
  }

  async function processQueue(): Promise<void> {
    if (processing) return;

    const item = dequeue(queue);
    if (!item) {
      queueTimer = null;
      updateQueueBadge();
      return;
    }

    processing = item.domain;
    updateQueueBadge();

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        await abortQueue();
        return;
      }

      const policy = await getRescanPolicy();
      const existingForPolicy = await getDomain(item.domain);
      let needsRescan = false;
      if (policy === 'always') {
        needsRescan = true;
      } else if (policy !== 'never' && existingForPolicy?.vt_last_analysis_date) {
        const threshold = policy === 'stale7' ? 7 * 24 * 60 * 60 * 1000 : STALE_THRESHOLD_MS;
        needsRescan = (Date.now() - existingForPolicy.vt_last_analysis_date) > threshold;
      }

      if (needsRescan) {
        const rescanResult = await rescanDomain(item.domain, apiKey);
        if (shouldCountApiRequest(rescanResult)) {
          await incrementApiUsage();
        }
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
          whois: result.data.whois ?? existing?.whois,
        };
        processing = null;
        updateQueueBadge();
        await saveDomain(record);
        await incrementApiUsage();
        trackManualBatchResult(item.domain, status);
      } else {
        switch (result.error.kind) {
          case 'invalid_key':
            await abortQueue();
            return;

          case 'rate_limited': {
            await incrementApiUsage();
            const currentUsage = await getApiUsage();
            if (currentUsage.count >= BUDGET.DAILY_MAX) {
              await abortQueue();
              return;
            }
            const rlRetries = (retryCount.get(item.domain) ?? 0) + 1;
            if (rlRetries <= RETRY.MAX_ATTEMPTS) {
              retryCount.set(item.domain, rlRetries);
              enqueue(queue, item.domain, item.priority);
            } else {
              retryCount.delete(item.domain);
              dropManualBatchDomain(item.domain);
            }
            processing = null;
            updateQueueBadge();
            queueTimer = setTimeout(() => {
              queueTimer = null;
              void processQueue();
            }, RETRY.RATE_LIMIT_DELAY_MS);
            return;
          }

          case 'not_found': {
            retryCount.delete(item.domain);
            processing = null;
            updateQueueBadge();
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
            trackManualBatchResult(item.domain, 'unknown');
            break;
          }

          case 'network': {
            const attempts = (retryCount.get(item.domain) ?? 0) + 1;
            if (attempts < RETRY.MAX_ATTEMPTS) {
              retryCount.set(item.domain, attempts);
              enqueue(queue, item.domain, item.priority);
            } else {
              retryCount.delete(item.domain);
              dropManualBatchDomain(item.domain);
            }
            processing = null;
            updateQueueBadge();
            queueTimer = setTimeout(() => {
              queueTimer = null;
              void processQueue();
            }, RETRY.NETWORK_DELAY_MS);
            return;
          }
        }
      }

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
      updateQueueBadge();
      queueTimer = setTimeout(() => {
        queueTimer = null;
        void processQueue();
      }, THROTTLE_MS);
    } catch (err) {
      console.warn(`Queue processing failed for ${item.domain}:`, err);
      dropManualBatchDomain(item.domain);
      processing = null;
      updateQueueBadge();
      queueTimer = setTimeout(() => {
        queueTimer = null;
        void processQueue();
      }, THROTTLE_MS);
    }
  }

  async function tickWatchlist(): Promise<void> {
    const interval = await getCheckInterval();
    const intervalMs = interval * 60 * 60 * 1000;
    const now = Date.now();
    const domains = await getWatchlistDomains();
    const usage = await resetApiUsageIfNewDay();
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
    updateQueueBadge();
    scheduleProcessQueue();
  }

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void updateBadgeForTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      void updateBadgeForTab(tabId);
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void tickWatchlist();
  });

  void initPause();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      try {
        void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
      } catch { /* ignore */ }
    }
    void createWatchlistAlarm();
  });

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

  function respondAsync<T>(sendResponse: (response: T) => void, task: () => Promise<T>): true {
    void task().then(sendResponse).catch((err) => {
      console.warn('Background message handler failed:', err);
      sendResponse({ ok: false, error: 'internal' } as T);
    });
    return true;
  }

  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (response?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'CHECK_DOMAIN': {
          beginManualBatch([msg.domain]);
          enqueue(queue, msg.domain, 'high');
          updateQueueBadge();
          scheduleProcessQueue();
          void refreshActiveBadge();
          sendResponse({ ok: true });
          break;
        }

        case 'ADD_DOMAIN':
          return respondAsync(sendResponse, async () => {
            const existing = await getDomain(msg.domain);
            const record: DomainRecord = {
              domain: msg.domain,
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
            beginManualBatch([msg.domain]);
            enqueue(queue, msg.domain, 'high');
            updateQueueBadge();
            scheduleProcessQueue();
            await refreshActiveBadge();
            return { ok: true };
          });

        case 'REMOVE_DOMAIN':
          return respondAsync(sendResponse, async () => {
            await removeDomain(msg.domain);
            await refreshActiveBadge();
            return { ok: true };
          });

        case 'CHECK_ALL':
          return respondAsync(sendResponse, async () => {
            const domains = await getWatchlistDomains();
            const batchDomains = domains.map((d) => d.domain);
            beginManualBatch(batchDomains);
            for (const domain of batchDomains) {
              enqueue(queue, domain, 'high');
            }
            updateQueueBadge();
            scheduleProcessQueue();
            return { ok: true };
          });

        case 'RESCAN_DOMAIN':
          return respondAsync(sendResponse, async () => {
            const apiKey = await getApiKey();
            if (!apiKey) return { ok: false, error: 'no_key' };
            const result = await rescanDomain(msg.domain, apiKey);
            if (shouldCountApiRequest(result)) {
              await incrementApiUsage();
            }
            if (result.ok) {
              return { ok: true };
            }
            return { ok: false, error: result.error.kind };
          });

        case 'BULK_ADD':
          return respondAsync(sendResponse, async () => {
            const now = Date.now();
            await saveBulkDomains(msg.domains, now);

            if (msg.checkNow) {
              const usage = await resetApiUsageIfNewDay();
              const maxBatch = 20;
              let queued = 0;
              const trackedDomains: string[] = [];

              for (const domain of msg.domains) {
                if (trackedDomains.length >= maxBatch) break;

                const alreadyInFlight = processing === domain || isQueued(queue, domain);
                if (!alreadyInFlight) {
                  const projectedCount = usage.count + queue.length + queued;
                  if (projectedCount >= BUDGET.HARD_CAP) break;
                  if (!enqueue(queue, domain, 'high')) continue;
                  queued += 1;
                }

                trackedDomains.push(domain);
              }

              if (trackedDomains.length > 0) {
                beginManualBatch(trackedDomains);
                updateQueueBadge();
                scheduleProcessQueue();
              }
            }

            await refreshActiveBadge();
            return { ok: true };
          });

        case 'VERIFY_KEY':
          return respondAsync(sendResponse, async () => {
            const result = await checkDomain('google.com', msg.key);
            if (shouldCountApiRequest(result)) {
              await incrementApiUsage();
            }
            if (result.ok) {
              await saveApiKey(msg.key);
              return { ok: true };
            }
            return { ok: false, error: result.error.kind };
          });

        case 'GET_QUEUE_STATUS':
          sendResponse({ length: queue.length, processing, completedBatch: lastCompletedBatch });
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

        case 'PAUSE':
          return respondAsync(sendResponse, async () => {
            await doPause();
            return { ok: true };
          });

        case 'UNPAUSE':
          return respondAsync(sendResponse, async () => {
            await doUnpause();
            return { ok: true };
          });
      }
    }) as (...args: any[]) => void,
  );
});
