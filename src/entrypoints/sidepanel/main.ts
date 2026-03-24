import { browser } from 'wxt/browser';
import { applyI18n, _ } from '@shared/i18n';
import { initTheme, toggleTheme, getThemePreference } from '@shared/theme';
import { sendMessage } from '@shared/messaging';
import {
  getDomains, getApiKey, saveApiKey, getApiUsage,
  getCheckInterval, saveCheckInterval,
} from '@shared/db';
import { normalizeDomainInput, extractDomain, toUnicode } from '@shared/domain-utils';
import { isStale } from '@shared/badge';
import { STORAGE_KEYS } from '@shared/constants';
import type { DomainRecord, DomainStatus, CheckInterval } from '@shared/types';
import { openBulkAddDrawer } from './components/bulk-add-drawer';

const $ = (s: string) => document.querySelector(s);

// --- Mode detection ---
const isSidebar = location.hash.includes('sidebar');
const isPopup = !isSidebar;

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

function renderWatchlist(domains: Record<string, DomainRecord>): void {
  const container = document.getElementById('watchlistContainer')!;
  const records = Object.values(domains)
    .filter(d => d.watchlist)
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
    if (unicode !== record.domain) name.title = record.domain;

    const meta = document.createElement('div');
    meta.className = 'domain-card__meta';
    const checked = document.createElement('span');
    if (record.last_checked) {
      checked.dataset.timestamp = String(record.last_checked);
      checked.textContent = timeAgo(record.last_checked);
    } else {
      checked.textContent = 'not checked';
    }
    meta.appendChild(checked);

    if (isStale(record)) {
      const stale = document.createElement('span');
      stale.className = 'stale-warning';
      stale.textContent = _('staleWarning', 'VT data is over 30 days old');
      meta.appendChild(stale);
    }

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

async function renderCurrentSite(): Promise<void> {
  const nav = document.getElementById('navTabs');
  nav?.classList.add('is-loading');

  const container = document.getElementById('currentSiteInfo')!;
  container.replaceChildren();

  try {
  // Check for API key first
  const apiKey = await getApiKey();

  let domain: string | null = null;
  try {
    // Try currentWindow first, fall back to lastFocusedWindow
    // (sidePanel may not belong to the "current" window context)
    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    }
    const tab = tabs[0];
    if (tab?.url) domain = extractDomain(tab.url);
  } catch { /* ignore */ }

  if (!domain) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = _('unsupportedPage', 'This page type is not supported');
    container.appendChild(msg);
    return;
  }

  const domains = await getDomains();
  const record = domains[domain];

  // Domain name
  const header = document.createElement('div');
  header.className = 'current-site__domain';
  if (record) {
    const dot = document.createElement('span');
    dot.className = `status-dot ${statusDotClass(record)}`;
    header.appendChild(dot);
  }
  const domainText = document.createElement('span');
  const domainUnicode = toUnicode(domain);
  domainText.textContent = domainUnicode;
  if (domainUnicode !== domain) domainText.title = domain;
  header.appendChild(domainText);
  container.appendChild(header);

  // No API key → setup CTA
  if (!apiKey) {
    const cta = document.createElement('div');
    cta.className = 'empty-state';
    cta.innerHTML = `<p style="margin-bottom: var(--space-3)">Set up your API key to check domains</p>`;
    const setupBtn = document.createElement('button');
    setupBtn.className = 'btn btn--primary btn--sm';
    setupBtn.textContent = 'Open Setup';
    setupBtn.addEventListener('click', () => {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    });
    cta.appendChild(setupBtn);
    container.appendChild(cta);
    return;
  }

  if (!record || !record.vt_stats) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = _('notChecked', 'Not checked yet');
    container.appendChild(msg);
  } else {
    // Status
    const statusEl = document.createElement('div');
    statusEl.className = 'current-site__status';
    statusEl.textContent = statusLabel(isStale(record) ? 'unknown' : record.status);
    container.appendChild(statusEl);

    // Stats grid
    const grid = document.createElement('div');
    grid.className = 'stats-grid';
    const stats = [
      { label: _('statMalicious', 'Malicious'), value: record.vt_stats.malicious, cls: 'stat-item--malicious' },
      { label: _('statSuspicious', 'Suspicious'), value: record.vt_stats.suspicious, cls: 'stat-item--suspicious' },
      { label: _('statHarmless', 'Harmless'), value: record.vt_stats.harmless, cls: 'stat-item--harmless' },
      { label: _('statUndetected', 'Undetected'), value: record.vt_stats.undetected, cls: '' },
    ];
    for (const s of stats) {
      const item = document.createElement('div');
      item.className = `stat-item ${s.cls}`;
      item.innerHTML = `<div class="stat-item__label">${s.label}</div><div class="stat-item__value">${s.value}</div>`;
      grid.appendChild(item);
    }
    container.appendChild(grid);

    // Dates
    const dates = document.createElement('div');
    dates.className = 'current-site__dates';
    if (record.last_checked) {
      const el = document.createElement('span');
      el.dataset.timestamp = String(record.last_checked);
      el.textContent = `Checked: ${timeAgo(record.last_checked)}`;
      dates.appendChild(el);
    }
    if (record.vt_last_analysis_date) {
      const el = document.createElement('span');
      el.textContent = `VT scanned: ${new Date(record.vt_last_analysis_date).toLocaleDateString()}`;
      dates.appendChild(el);
    }
    container.appendChild(dates);

    if (isStale(record)) {
      const warn = document.createElement('div');
      warn.className = 'stale-warning';
      warn.textContent = _('staleWarning', 'VT data is over 30 days old');
      container.appendChild(warn);
    }
  }

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'display: flex; gap: var(--space-2); margin-top: var(--space-3);';

  const checkBtn = document.createElement('button');
  checkBtn.className = 'btn btn--primary btn--sm';
  checkBtn.textContent = _('checkNowBtn', 'Check now');
  checkBtn.addEventListener('click', () => {
    checkBtn.classList.add('btn--loading');
    void sendMessage({ type: 'CHECK_DOMAIN', domain: domain! });
  });
  actionsDiv.appendChild(checkBtn);

  if (!record?.watchlist) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--outline btn--sm';
    addBtn.textContent = _('addToWatchlistBtn', 'Add to watchlist');
    addBtn.addEventListener('click', () => {
      void sendMessage({ type: 'ADD_DOMAIN', domain: domain! });
    });
    actionsDiv.appendChild(addBtn);
  }

  // VT report link
  const vtLink = document.createElement('a');
  vtLink.className = 'btn btn--ghost btn--sm';
  vtLink.href = `https://www.virustotal.com/gui/domain/${domain}`;
  vtLink.target = '_blank';
  vtLink.rel = 'noreferrer';
  vtLink.innerHTML = '<svg width="14" height="14" style="vertical-align:-2px"><use href="#ico-vt"/></svg> VT Report';
  actionsDiv.appendChild(vtLink);

  container.appendChild(actionsDiv);
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
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await sp.open({ tabId: tab.id });
          }
          window.close();
        }
      } catch { /* ignore */ }
    })();
  });
}

// --- Live updates ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.DOMAINS]) {
    const newDomains = (changes[STORAGE_KEYS.DOMAINS].newValue || {}) as Record<string, DomainRecord>;
    renderWatchlist(newDomains);
    void renderCurrentSite();
  }
  if (area === 'local' && changes[STORAGE_KEYS.API_USAGE]) {
    void updateUsageDisplay();
  }
  if (area === 'sync' && changes[STORAGE_KEYS.VT_API_KEY]) {
    const keyInput = document.getElementById('settingsApiKey') as HTMLInputElement | null;
    if (keyInput) keyInput.value = (changes[STORAGE_KEYS.VT_API_KEY].newValue || '') as string;
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
