import { browser } from 'wxt/browser';
import { applyI18n, _ } from '@shared/i18n';
import { initTheme, toggleTheme, getThemePreference } from '@shared/theme';
import { sendMessage } from '@shared/messaging';
import {
  getDomains, getApiKey, saveApiKey, getApiUsage,
  getCheckInterval, saveCheckInterval, isPaused,
} from '@shared/db';
import { STORAGE_KEYS as SK_PAUSE } from '@shared/constants';
import { showToast } from '@shared/ui-helpers';
import { normalizeDomainInput, extractDomain, toUnicode } from '@shared/domain-utils';
import { isStale } from '@shared/badge';
import { STORAGE_KEYS } from '@shared/constants';
import type { DomainRecord, DomainStatus, CheckInterval } from '@shared/types';
import { openBulkAddDrawer } from './components/bulk-add-drawer';
import { openDisputeDrawer } from './components/dispute-drawer';

const $ = (s: string) => document.querySelector(s);

// --- Mode detection ---
const isSidebar = location.hash.includes('sidebar');
const isPopup = !isSidebar;
let hostWindowId: number | null = null;

async function getContextTab() {
  try {
    if (isSidebar) {
      if (hostWindowId === null) {
        const win = await browser.windows.getCurrent();
        hostWindowId = win.id ?? null;
      }
      if (hostWindowId !== null) {
        const tabs = await browser.tabs.query({ active: true, windowId: hostWindowId });
        if (tabs.length) return tabs[0];
      }
    }

    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    }
    return tabs[0] ?? null;
  } catch {
    return null;
  }
}

function shouldRefreshForWindow(windowId?: number): boolean {
  if (!isSidebar) return true;
  if (hostWindowId === null) return true;
  return windowId === hostWindowId;
}

// --- Tab navigation ---
type ViewName = 'watchlist' | 'current' | 'settings';

function showView(name: ViewName): void {
  document.querySelectorAll('[data-view-content]').forEach(el => {
    (el as HTMLElement).hidden = el.getAttribute('data-view-content') !== name;
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.getAttribute('data-tab') === name);
  });
}

function initNavigation(): void {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab') as ViewName;
      if (name) showView(name);
    });
  });
}

// --- Search state ---
let searchQuery = '';

// --- Helpers ---

function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusLabel(status: DomainStatus): string {
  const map: Record<DomainStatus, string> = {
    clean: _('statusClean', 'Clean'),
    suspicious: _('statusSuspicious', 'Suspicious'),
    malicious: _('statusMalicious', 'Malicious'),
    unknown: _('statusUnknown', 'Unknown'),
    pending: _('statusPending', 'Checking...'),
  };
  return map[status] || status;
}

function statusDotClass(record: DomainRecord): string {
  if (isStale(record)) return 'status-dot--unknown';
  return `status-dot--${record.status}`;
}

// --- Watchlist rendering ---

let lastDomains: Record<string, DomainRecord> = {};

function renderWatchlist(domains: Record<string, DomainRecord>): void {
  lastDomains = domains;
  const container = document.getElementById('watchlistContainer')!;
  const q = searchQuery.toLowerCase();
  const records = Object.values(domains)
    .filter(d => d.watchlist)
    .filter(d => !q || d.domain.includes(q) || toUnicode(d.domain).toLowerCase().includes(q))
    .sort((a, b) => b.added_at - a.added_at);

  container.replaceChildren();

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = _('emptyWatchlist', 'No domains yet. Add your first domain above.');
    container.appendChild(empty);
    return;
  }

  for (const record of records) {
    const card = document.createElement('div');
    card.className = 'domain-card';

    const dot = document.createElement('span');
    dot.className = `status-dot ${statusDotClass(record)}`;

    const info = document.createElement('div');
    info.className = 'domain-card__info';

    const name = document.createElement('div');
    name.className = 'domain-card__name';
    const unicode = toUnicode(record.domain);
    name.textContent = unicode;
    if (unicode !== record.domain) {
      const idnBadge = document.createElement('span');
      idnBadge.className = 'idn-badge';
      idnBadge.innerHTML = '<svg width="18" height="11"><use href="#ico-idn"/></svg>';
      idnBadge.title = record.domain;
      name.appendChild(idnBadge);
    }

    const meta = document.createElement('div');
    meta.className = 'domain-card__meta';
    const checked = document.createElement('span');
    if (record.status === 'pending') {
      checked.textContent = 'in queue\u2026';
      checked.style.color = 'var(--status-pending)';
    } else if (isStale(record) && record.vt_last_analysis_date) {
      // Stale: show VT scan date + rescan link
      const staleText = document.createElement('span');
      staleText.textContent = `VT scan: ${new Date(record.vt_last_analysis_date).toLocaleDateString()}`;
      staleText.style.color = 'var(--status-suspicious)';
      staleText.title = record.last_checked ? `Checked: ${timeAgo(record.last_checked)}` : '';
      meta.appendChild(staleText);

      const rescanLink = document.createElement('a');
      rescanLink.className = 'stale-warning';
      rescanLink.href = `https://www.virustotal.com/gui/domain/${record.domain}`;
      rescanLink.target = '_blank';
      rescanLink.rel = 'noreferrer';
      rescanLink.textContent = 'Rescan on VT \u2197';
      rescanLink.style.cursor = 'pointer';
      meta.appendChild(rescanLink);
    } else if (record.last_checked) {
      checked.dataset.timestamp = String(record.last_checked);
      checked.textContent = timeAgo(record.last_checked);
    } else {
      checked.textContent = 'not checked';
    }
    meta.appendChild(checked);

    info.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'domain-card__actions';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn--sm btn--outline';
    checkBtn.textContent = _('checkNowBtn', 'Check');
    checkBtn.addEventListener('click', () => {
      checkBtn.classList.add('btn--loading');
      void sendMessage({ type: 'CHECK_DOMAIN', domain: record.domain });
    });

    // Dispute button (only for malicious/suspicious with vendor data)
    if (record.vt_vendors && record.vt_vendors.length > 0 && (record.status === 'malicious' || record.status === 'suspicious')) {
      const disputeBtn = document.createElement('button');
      disputeBtn.className = 'btn btn--sm btn--ghost';
      disputeBtn.textContent = 'Dispute';
      disputeBtn.addEventListener('click', () => {
        openDisputeDrawer(record.domain, record.vt_vendors!, record.disputes);
      });
      actions.appendChild(disputeBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-icon';
    removeBtn.style.cssText = 'width: 24px; height: 24px;';
    removeBtn.innerHTML = '<svg width="14" height="14"><use href="#ico-close"/></svg>';
    removeBtn.title = _('removeBtn', 'Remove');
    removeBtn.addEventListener('click', () => {
      void sendMessage({ type: 'REMOVE_DOMAIN', domain: record.domain });
    });

    actions.append(checkBtn, removeBtn);
    card.append(dot, info, actions);
    container.appendChild(card);
  }
}

// --- Current Site ---

let renderToken = 0;

async function renderCurrentSite(): Promise<void> {
  const token = ++renderToken;
  const nav = document.getElementById('navTabs');
  nav?.classList.add('is-loading');

  const container = document.getElementById('currentSiteInfo')!;
  container.replaceChildren();

  try {
  // Check for API key first
  const apiKey = await getApiKey();
  if (token !== renderToken) return;

  let domain: string | null = null;
  const tab = await getContextTab();
  if (token !== renderToken) return;
  const tabUrl = tab?.url ?? tab?.pendingUrl;
  if (tabUrl) domain = extractDomain(tabUrl);

  if (!domain) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = _('unsupportedPage', 'This page type is not supported');
    container.appendChild(msg);
    return;
  }

  const domains = await getDomains();
  if (token !== renderToken) return;
  const record = domains[domain];

  const domainUnicode = toUnicode(domain);

  // Inspector card surface
  const card = document.createElement('div');
  card.className = 'inspect-card';

  // Row 1: domain + verdict chip + freshness
  const summary = document.createElement('div');
  summary.className = 'inspect-card__summary';

  const domainEl = document.createElement('span');
  domainEl.className = 'inspect-card__domain';
  domainEl.textContent = domainUnicode;
  if (domainUnicode !== domain) {
    const idnBadge = document.createElement('span');
    idnBadge.className = 'idn-badge';
    idnBadge.innerHTML = '<svg width="18" height="11"><use href="#ico-idn"/></svg>';
    idnBadge.title = domain;
    domainEl.appendChild(idnBadge);
  }
  summary.appendChild(domainEl);

  // No API key → setup CTA
  if (!apiKey) {
    const cta = document.createElement('div');
    cta.className = 'inspect-card__body';
    cta.innerHTML = '<p style="color: var(--text-muted); margin-bottom: var(--space-2)">Set up your API key to check domains</p>';
    const setupBtn = document.createElement('button');
    setupBtn.className = 'btn btn--primary btn--sm';
    setupBtn.textContent = 'Open Setup';
    setupBtn.addEventListener('click', () => {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    });
    cta.appendChild(setupBtn);
    card.append(summary, cta);
    container.appendChild(card);
    return;
  }

  // Verdict chip
  if (record && record.vt_stats) {
    const effectiveStatus = isStale(record) ? 'unknown' : record.status;
    const chip = document.createElement('span');
    chip.className = `verdict-chip verdict-chip--${effectiveStatus}`;
    chip.textContent = statusLabel(effectiveStatus);
    summary.appendChild(chip);

    // Freshness chip
    if (record.last_checked) {
      const fresh = document.createElement('span');
      fresh.className = 'freshness-chip';
      fresh.dataset.timestamp = String(record.last_checked);
      fresh.textContent = timeAgo(record.last_checked);
      if (isStale(record)) fresh.classList.add('freshness-chip--stale');
      summary.appendChild(fresh);
    }
  }

  card.appendChild(summary);

  if (!record || !record.vt_stats) {
    const msg = document.createElement('div');
    msg.className = 'inspect-card__body';
    msg.style.cssText = 'color: var(--text-muted);';
    msg.textContent = _('notChecked', 'Not checked yet');
    card.appendChild(msg);
  } else {
    // Row 2: compact stats
    const stats = document.createElement('div');
    stats.className = 'inspect-card__stats';
    const items = [
      { label: 'Mal', value: record.vt_stats.malicious, cls: record.vt_stats.malicious > 0 ? 'stat--bad' : '' },
      { label: 'Sus', value: record.vt_stats.suspicious, cls: record.vt_stats.suspicious > 0 ? 'stat--warn' : '' },
      { label: 'OK', value: record.vt_stats.harmless, cls: 'stat--ok' },
      { label: 'N/A', value: record.vt_stats.undetected, cls: '' },
    ];
    for (const s of items) {
      const el = document.createElement('span');
      el.className = `inspect-card__stat ${s.cls}`;
      el.innerHTML = `<strong>${s.value}</strong> ${s.label}`;
      stats.appendChild(el);
    }
    card.appendChild(stats);

    // VT scan date + stale warning
    if (record.vt_last_analysis_date) {
      const meta = document.createElement('div');
      meta.className = 'inspect-card__meta';
      meta.textContent = `VT scan: ${new Date(record.vt_last_analysis_date).toLocaleDateString()}`;
      if (isStale(record)) {
        meta.textContent += ` \u2022 ${_('staleWarning', 'data is over 30 days old')}`;
        meta.classList.add('inspect-card__meta--stale');
      }
      card.appendChild(meta);
    }
  }

  // Row 3: actions toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'inspect-card__toolbar';

  const checkBtn = document.createElement('button');
  checkBtn.className = 'btn btn--primary btn--sm';
  checkBtn.textContent = _('checkNowBtn', 'Check now');
  checkBtn.addEventListener('click', () => {
    checkBtn.classList.add('btn--loading');
    void sendMessage({ type: 'CHECK_DOMAIN', domain: domain! });
  });
  toolbar.appendChild(checkBtn);

  if (!record?.watchlist) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--outline btn--sm';
    addBtn.textContent = _('addToWatchlistBtn', 'Add to watchlist');
    addBtn.addEventListener('click', () => {
      void sendMessage({ type: 'ADD_DOMAIN', domain: domain! });
    });
    toolbar.appendChild(addBtn);
  }

  const vtLink = document.createElement('a');
  vtLink.className = 'btn btn--ghost btn--sm';
  vtLink.href = `https://www.virustotal.com/gui/domain/${domain}`;
  vtLink.target = '_blank';
  vtLink.rel = 'noreferrer';
  vtLink.innerHTML = '<svg width="14" height="14" style="vertical-align:-2px"><use href="#ico-vt"/></svg> VT';
  toolbar.appendChild(vtLink);

  if (record?.vt_vendors && record.vt_vendors.length > 0 && (record.status === 'malicious' || record.status === 'suspicious')) {
    const disputeBtn = document.createElement('button');
    disputeBtn.className = 'btn btn--sm btn--outline';
    disputeBtn.style.cssText = 'border-color: var(--status-suspicious); color: var(--status-suspicious);';
    disputeBtn.textContent = 'Dispute';
    disputeBtn.addEventListener('click', () => {
      openDisputeDrawer(domain!, record.vt_vendors!, record.disputes);
    });
    toolbar.appendChild(disputeBtn);
  }

  card.appendChild(toolbar);
  container.appendChild(card);
  } finally {
    nav?.classList.remove('is-loading');
  }
}

// --- Settings ---

async function initSettings(): Promise<void> {
  // API Key
  const keyInput = document.getElementById('settingsApiKey') as HTMLInputElement;
  const keyStatus = document.getElementById('settingsKeyStatus')!;
  const key = await getApiKey();
  if (key) keyInput.value = key;

  document.getElementById('btnVerifyKey')!.addEventListener('click', () => {
    const val = keyInput.value.trim();
    if (!val) return;
    keyStatus.textContent = '...';
    keyStatus.className = 'inline-msg is-visible';

    void sendMessage({ type: 'VERIFY_KEY', key: val }).then(result => {
      if (result.ok) {
        keyStatus.textContent = '\u2713 ' + _('keyValid', 'Key valid');
        keyStatus.className = 'inline-msg is-visible inline-msg--success';
      } else {
        keyStatus.textContent = '\u2717 ' + _('keyInvalid', 'Invalid key');
        keyStatus.className = 'inline-msg is-visible inline-msg--error';
      }
    }).catch(() => {
      keyStatus.textContent = 'Error';
      keyStatus.className = 'inline-msg is-visible inline-msg--error';
    });
  });

  // Interval
  const intervalSelect = document.getElementById('settingsInterval') as HTMLSelectElement;
  const interval = await getCheckInterval();
  intervalSelect.value = String(interval);
  intervalSelect.addEventListener('change', () => {
    void saveCheckInterval(Number(intervalSelect.value) as CheckInterval);
  });

  // API usage
  await updateUsageDisplay();

  // Check all
  document.getElementById('btnCheckAll')!.addEventListener('click', () => {
    void sendMessage({ type: 'CHECK_ALL' });
  });

  // Setup guide
  document.getElementById('btnSetupGuide')!.addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });
}

async function updateUsageDisplay(): Promise<void> {
  const el = document.getElementById('apiUsageDisplay');
  if (!el) return;
  const usage = await getApiUsage();
  el.textContent = `${usage.count} / 500 ${_('apiUsageLabel', 'API usage today')}`;
}

// --- Popup mode ---

function initPopupMode(): void {
  if (!isPopup) return;
  document.documentElement.setAttribute('data-popup', '');
  const nav = document.getElementById('navTabs');
  if (nav) nav.hidden = true;
  showView('current');

  const footer = document.getElementById('popupFooter');
  if (footer) footer.hidden = false;

  document.getElementById('btnOpenMonitor')?.addEventListener('click', () => {
    try {
      const sa = (browser as any).sidebarAction;
      if (sa?.open) { void sa.open(); window.close(); return; }
    } catch { /* ignore */ }

    void (async () => {
      try {
        const sp = (browser as any).sidePanel;
        if (sp?.open) {
          const tab = await getContextTab();
          if (tab?.id) {
            await sp.open({ tabId: tab.id });
          }
          window.close();
        }
      } catch { /* ignore */ }
    })();
  });
}

// --- Queue activity indicator ---

let prevPendingCount = 0;

function updateQueueIndicator(domains: Record<string, DomainRecord>): void {
  const nav = document.getElementById('navTabs');
  const all = Object.values(domains).filter(d => d.watchlist);
  const pendingCount = all.filter(d => d.status === 'pending').length;

  if (pendingCount > 0) {
    nav?.classList.add('is-loading');
    nav?.setAttribute('data-queue', `Checking ${pendingCount}\u2026`);
  } else {
    nav?.classList.remove('is-loading');
    nav?.removeAttribute('data-queue');

    // Queue just finished — show summary toast
    if (prevPendingCount > 0) {
      const mal = all.filter(d => d.status === 'malicious').length;
      const sus = all.filter(d => d.status === 'suspicious').length;
      const clean = all.filter(d => d.status === 'clean').length;
      if (mal > 0 || sus > 0) {
        showToast(`Check complete: ${mal} malicious, ${sus} suspicious, ${clean} clean`, 'warning');
      } else {
        showToast(`Check complete: ${all.length} domains, all clean`, 'success');
      }
    }
  }
  prevPendingCount = pendingCount;
}

// --- Live updates ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.DOMAINS]) {
    const newDomains = (changes[STORAGE_KEYS.DOMAINS].newValue || {}) as Record<string, DomainRecord>;
    renderWatchlist(newDomains);
    void renderCurrentSite();
    updateQueueIndicator(newDomains);
  }
  if (area === 'local' && changes[STORAGE_KEYS.API_USAGE]) {
    void updateUsageDisplay();
  }
  if (area === 'sync' && changes[STORAGE_KEYS.VT_API_KEY]) {
    const keyInput = document.getElementById('settingsApiKey') as HTMLInputElement | null;
    if (keyInput) keyInput.value = (changes[STORAGE_KEYS.VT_API_KEY].newValue || '') as string;
  }
});

browser.tabs.onActivated.addListener(({ windowId }) => {
  if (shouldRefreshForWindow(windowId)) {
    void renderCurrentSite();
  }
});

browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (!changeInfo.status && !changeInfo.url) return;
  if (shouldRefreshForWindow(tab.windowId)) {
    void renderCurrentSite();
  }
});

browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  if (shouldRefreshForWindow(windowId)) {
    void renderCurrentSite();
  }
});

// --- Boot ---

void (async function boot(): Promise<void> {
  try {
    const lang = chrome.i18n.getUILanguage();
    document.documentElement.lang = lang;
  } catch { /* ignore */ }

  initTheme();
  applyI18n();
  initPopupMode();
  initNavigation();

  const domains = await getDomains();
  renderWatchlist(domains);
  updateQueueIndicator(domains);
  await renderCurrentSite();
  await initSettings();

  // Theme toggle
  function updateThemeIcon(): void {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    const pref = getThemePreference();
    const map = { dark: '#ico-moon', light: '#ico-sun', auto: '#ico-auto' };
    icon.setAttribute('href', map[pref]);
  }

  updateThemeIcon();
  $('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    toggleTheme();
    updateThemeIcon();
  });

  // Pause button
  const pauseBtn = document.getElementById('btnPause') as HTMLButtonElement | null;
  const pauseIconEl = document.getElementById('pauseIcon') as SVGPathElement | null;
  const PAUSE_PATH = 'M14,19H18V5H14M6,19H10V5H6V19Z';
  const PLAY_PATH = 'M8,5.14V19.14L19,12.14L8,5.14Z';

  async function updatePauseBtn(): Promise<void> {
    if (!pauseBtn || !pauseIconEl) return;
    const paused = await isPaused();
    pauseBtn.classList.toggle('is-active', paused);
    pauseIconEl.setAttribute('d', paused ? PLAY_PATH : PAUSE_PATH);
    pauseBtn.title = paused ? 'Resume checking' : 'Pause checking (1h)';
  }

  void updatePauseBtn();
  pauseBtn?.addEventListener('click', async () => {
    const paused = await isPaused();
    if (paused) {
      await sendMessage({ type: 'UNPAUSE' });
    } else {
      await sendMessage({ type: 'PAUSE' });
    }
    await updatePauseBtn();
  });

  // Listen for pause changes from other contexts
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SK_PAUSE.PAUSE_UNTIL]) {
      void updatePauseBtn();
    }
  });

  // Add domain form
  const addInput = document.getElementById('addDomainInput') as HTMLInputElement;
  const addBtn = document.getElementById('btnAddDomain') as HTMLButtonElement;
  const addError = document.getElementById('addDomainError')!;

  function clearAddError(): void {
    addInput?.classList.remove('input--error');
    addError.className = 'inline-msg';
    addError.textContent = '';
  }

  addInput?.addEventListener('input', clearAddError);

  addBtn?.addEventListener('click', () => {
    const domain = normalizeDomainInput(addInput.value);
    if (!domain) {
      if (addInput.value.trim()) {
        addInput.classList.add('input--error');
        addError.textContent = 'Enter a valid domain';
        addError.className = 'inline-msg is-visible inline-msg--error';
      }
      return;
    }
    clearAddError();
    addBtn.classList.add('btn--loading');
    void sendMessage({ type: 'ADD_DOMAIN', domain }).finally(() => {
      addBtn.classList.remove('btn--loading');
    });
    addInput.value = '';
  });

  // Enter key in add domain input
  addInput?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addBtn?.click();
  });

  // Bulk add
  document.getElementById('btnBulkAdd')?.addEventListener('click', openBulkAddDrawer);

  // Search toggle
  const addMode = document.getElementById('addMode')!;
  const searchMode = document.getElementById('searchMode')!;
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;

  document.getElementById('btnToggleSearch')?.addEventListener('click', () => {
    addMode.hidden = true;
    searchMode.hidden = false;
    searchInput.value = '';
    searchInput.focus();
  });

  document.getElementById('btnCloseSearch')?.addEventListener('click', () => {
    searchMode.hidden = true;
    addMode.hidden = false;
    searchQuery = '';
    renderWatchlist(lastDomains);
  });

  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderWatchlist(lastDomains);
  });

  // Escape closes search
  searchInput?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      document.getElementById('btnCloseSearch')?.click();
    }
  });

  // Relative time auto-refresh (every 60s)
  setInterval(() => {
    document.querySelectorAll<HTMLElement>('[data-timestamp]').forEach(el => {
      const ts = Number(el.dataset.timestamp);
      if (ts) {
        const prefix = el.textContent?.startsWith('Checked:') ? 'Checked: ' : '';
        el.textContent = prefix + timeAgo(ts);
      }
    });
  }, 60_000);
})();
