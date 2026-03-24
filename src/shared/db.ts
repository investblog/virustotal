import type { DomainRecord, ApiUsage, CheckInterval, ThemePreference, RescanPolicy } from './types';
import { STORAGE_KEYS } from './constants';

const DEFAULT_CHECK_INTERVAL: CheckInterval = 24;

// --- Serialized storage access (prevents lost updates) ---

let domainLock: Promise<void> = Promise.resolve();

function withDomainLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = domainLock;
  let resolve: () => void;
  domainLock = new Promise<void>(r => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

// --- Domains (storage.local) ---

export async function getDomains(): Promise<Record<string, DomainRecord>> {
  return new Promise(resolve => {
    chrome.storage.local.get({ [STORAGE_KEYS.DOMAINS]: {} }, data => {
      resolve((data[STORAGE_KEYS.DOMAINS] || {}) as Record<string, DomainRecord>);
    });
  });
}

export async function getDomain(domain: string): Promise<DomainRecord | undefined> {
  const map = await getDomains();
  return map[domain];
}

export function saveDomain(record: DomainRecord): Promise<void> {
  return withDomainLock(async () => {
    const map = await getDomains();
    map[record.domain] = record;
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.DOMAINS]: map }, resolve);
    });
  });
}

export function removeDomain(domain: string): Promise<void> {
  return withDomainLock(async () => {
    const map = await getDomains();
    delete map[domain];
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.DOMAINS]: map }, resolve);
    });
  });
}

export function saveBulkDomains(domains: string[], now: number): Promise<void> {
  return withDomainLock(async () => {
    const map = await getDomains();
    for (const domain of domains) {
      const prev = map[domain];
      map[domain] = {
        domain,
        watchlist: true,
        added_at: prev?.added_at ?? now,
        last_checked: prev?.last_checked ?? 0,
        vt_last_analysis_date: prev?.vt_last_analysis_date ?? null,
        vt_stats: prev?.vt_stats ?? null,
        vt_vendors: prev?.vt_vendors ?? null,
        status: prev?.status ?? 'pending',
        disputes: prev?.disputes,
      };
    }
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.DOMAINS]: map }, resolve);
    });
  });
}

export async function getWatchlistDomains(): Promise<DomainRecord[]> {
  const map = await getDomains();
  return Object.values(map).filter(d => d.watchlist);
}

// --- API Usage (storage.local) ---

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getApiUsage(): Promise<ApiUsage> {
  return new Promise(resolve => {
    chrome.storage.local.get({ [STORAGE_KEYS.API_USAGE]: { count: 0, date: todayUtc() } }, data => {
      resolve(data[STORAGE_KEYS.API_USAGE] as ApiUsage);
    });
  });
}

export async function resetApiUsageIfNewDay(): Promise<ApiUsage> {
  const usage = await getApiUsage();
  const today = todayUtc();
  if (usage.date !== today) {
    const fresh: ApiUsage = { count: 0, date: today };
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.API_USAGE]: fresh }, resolve);
    });
    return fresh;
  }
  return usage;
}

let usageLock: Promise<void> = Promise.resolve();

function withUsageLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = usageLock;
  let resolve: () => void;
  usageLock = new Promise<void>(r => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

export function incrementApiUsage(): Promise<ApiUsage> {
  return withUsageLock(async () => {
    const usage = await resetApiUsageIfNewDay();
    usage.count += 1;
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.API_USAGE]: usage }, resolve);
    });
    return usage;
  });
}

// --- Settings (storage.sync) ---

export async function getApiKey(): Promise<string> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ [STORAGE_KEYS.VT_API_KEY]: '' }, data => {
      resolve(data[STORAGE_KEYS.VT_API_KEY] as string);
    });
  });
}

export async function saveApiKey(key: string): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.VT_API_KEY]: key }, resolve);
  });
}

export async function getCheckInterval(): Promise<CheckInterval> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ [STORAGE_KEYS.CHECK_INTERVAL]: DEFAULT_CHECK_INTERVAL }, data => {
      resolve(data[STORAGE_KEYS.CHECK_INTERVAL] as CheckInterval);
    });
  });
}

export async function saveCheckInterval(hours: CheckInterval): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.CHECK_INTERVAL]: hours }, resolve);
  });
}

export async function getThemePreference(): Promise<ThemePreference> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ [STORAGE_KEYS.THEME]: 'auto' }, data => {
      resolve(data[STORAGE_KEYS.THEME] as ThemePreference);
    });
  });
}

export async function saveThemePreference(pref: ThemePreference): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.THEME]: pref }, resolve);
  });
}

// --- Rescan policy (storage.sync) ---

export async function getRescanPolicy(): Promise<RescanPolicy> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ [STORAGE_KEYS.RESCAN_POLICY]: 'stale30' }, data => {
      resolve(data[STORAGE_KEYS.RESCAN_POLICY] as RescanPolicy);
    });
  });
}

export async function saveRescanPolicy(policy: RescanPolicy): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.RESCAN_POLICY]: policy }, resolve);
  });
}

// --- Pause (storage.sync) ---

export async function getPauseUntil(): Promise<number | null> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ [STORAGE_KEYS.PAUSE_UNTIL]: null }, data => {
      resolve(data[STORAGE_KEYS.PAUSE_UNTIL] as number | null);
    });
  });
}

export async function setPauseUntil(ts: number | null): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.PAUSE_UNTIL]: ts }, resolve);
  });
}

export async function isPaused(): Promise<boolean> {
  const until = await getPauseUntil();
  return until !== null && until > Date.now();
}
