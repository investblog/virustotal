import { browser } from 'wxt/browser';
import { applyI18n, _ } from '@shared/i18n';
import { initTheme, toggleTheme, getThemePreference } from '@shared/theme';
import { sendMessage } from '@shared/messaging';
import {
  getDomains, getApiKey, getApiUsage, isPaused,
} from '@shared/db';
import { showToast } from '@shared/ui-helpers';
import { normalizeDomainInput, extractDomain, toUnicode } from '@shared/domain-utils';
import { isStale } from '@shared/badge';
import { STORAGE_KEYS } from '@shared/constants';
import type { DomainRecord, DomainStatus } from '@shared/types';
import { openBulkAddDrawer } from './components/bulk-add-drawer';
import { openDisputeDrawer } from './components/dispute-drawer';
import { openSettingsDrawer } from './components/settings-drawer';

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
type ViewName = 'watchlist' | 'current';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function currentSiteHeadline(record: DomainRecord | undefined): string {
  if (!record?.vt_stats) return _('notChecked', 'Not checked yet');
  if (record.status === 'pending') return _('statusPending', 'Checking...');
  if (isStale(record)) return _('staleWarning', 'VirusTotal data is over 30 days old');

  const { malicious, suspicious } = record.vt_stats;

  if (record.status === 'malicious') {
    const parts = [pluralize(malicious, 'malicious detection')];
    if (suspicious > 0) parts.push(pluralize(suspicious, 'suspicious signal'));
    return parts.join(' | ');
  }

  if (record.status === 'suspicious') {
    return pluralize(suspicious, 'suspicious signal');
  }

  if (record.status === 'clean') {
    return _('noDetections', 'No malicious or suspicious detections');
  }

  return statusLabel(record.status);
}

function createIcon(symbolId: string, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function createWhoisChip(
  symbolId: string,
  text: string,
  title: string,
  extraClass = '',
): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.className = `whois-chip${extraClass}`;
  chip.title = title;
  chip.append(createIcon(symbolId, 12, 12), document.createTextNode(` ${text}`));
  return chip;
}

function formatBatchSummary(summary: {
  processed: number;
  malicious: number;
  suspicious: number;
}): { message: string; tone: 'success' | 'warning' } {
  if (summary.malicious > 0 || summary.suspicious > 0) {
    return {
      message: `Check complete: ${summary.malicious} malicious, ${summary.suspicious} suspicious`,
      tone: 'warning',
    };
  }
  return {
    message: `Check complete: ${summary.processed} domain${summary.processed > 1 ? 's' : ''} checked - all clean`,
    tone: 'success',
  };
}

// --- Watchlist rendering ---

let lastDomains: Record<string, DomainRecord> = {};

function updateFooterCount(domains: Record<string, DomainRecord>): void {
  const el = document.getElementById('footerCount');
  if (!el) return;
  const count = Object.values(domains).filter(d => d.watchlist).length;
  el.textContent = String(count);
  el.title = `${count} domain${count !== 1 ? 's' : ''} in watchlist`;
}

function renderWatchlist(domains: Record<string, DomainRecord>): void {
  lastDomains = domains;
  updateFooterCount(domains);
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
      // Stale: show VT scan date (our check time in tooltip)
      checked.textContent = `VT scan: ${new Date(record.vt_last_analysis_date).toLocaleDateString()}`;
      checked.style.color = 'var(--status-suspicious)';
      checked.title = record.last_checked ? `Checked: ${timeAgo(record.last_checked)}` : '';
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
    if (record.status === 'pending') {
      checkBtn.textContent = 'Queued';
      checkBtn.disabled = true;
    } else {
      checkBtn.textContent = _('checkNowBtn', 'Check');
      checkBtn.addEventListener('click', () => {
        checkBtn.classList.add('btn--loading');
        void sendMessage({ type: 'CHECK_DOMAIN', domain: record.domain });
      });
    }

    // Reanalyze (stale data): icon button + manual VT link
    if (isStale(record)) {
      const rescanBtn = document.createElement('button');
      rescanBtn.className = 'btn-icon';
      rescanBtn.style.cssText = 'width: 24px; height: 24px; color: var(--status-suspicious);';
      rescanBtn.title = 'Reanalyze (1 API request)';
      rescanBtn.innerHTML = '<svg width="14" height="14"><use href="#ico-refresh"/></svg>';
      rescanBtn.addEventListener('click', () => {
        rescanBtn.classList.add('btn--loading');
        void sendMessage({ type: 'RESCAN_DOMAIN', domain: record.domain }).then(res => {
          rescanBtn.classList.remove('btn--loading');
          if (res.ok) {
            showToast(`${record.domain}: reanalyze requested. Check again in ~30s.`, 'info');
          } else {
            showToast(`Reanalyze failed: ${res.error ?? 'unknown'}`, 'error');
          }
        }).catch(() => rescanBtn.classList.remove('btn--loading'));
      });
      actions.appendChild(rescanBtn);

      const manualLink = document.createElement('a');
      manualLink.className = 'btn-icon';
      manualLink.style.cssText = 'width: 24px; height: 24px;';
      manualLink.href = `https://www.virustotal.com/gui/domain/${record.domain}`;
      manualLink.target = '_blank';
      manualLink.rel = 'noreferrer';
      manualLink.title = 'Open on VT (free)';
      manualLink.innerHTML = '<svg width="14" height="14"><use href="#ico-open-in-new"/></svg>';
      actions.appendChild(manualLink);
    }

    // Dispute button + progress (only for malicious/suspicious with vendor data)
    if (record.vt_vendors && record.vt_vendors.length > 0 && (record.status === 'malicious' || record.status === 'suspicious')) {
      const disputes = record.disputes ?? {};
      const total = record.vt_vendors.filter(v => v.category === 'malicious' || v.category === 'suspicious').length;
      const disputed = Object.values(disputes).filter(s => s === 'disputed').length;
      const resolved = Object.values(disputes).filter(s => s === 'resolved').length;

      const disputeBtn = document.createElement('button');
      disputeBtn.className = 'btn btn--sm btn--ghost';

      if (resolved === total && total > 0) {
        disputeBtn.innerHTML = '<svg width="12" height="12"><use href="#ico-check-circle"/></svg>';
        disputeBtn.style.color = 'var(--status-clean)';
        disputeBtn.title = `All ${total} vendors resolved`;
      } else if (disputed + resolved > 0) {
        disputeBtn.textContent = `${disputed + resolved}/${total}`;
        disputeBtn.style.color = 'var(--status-suspicious)';
        disputeBtn.title = `${disputed} disputed, ${resolved} resolved of ${total}`;
      } else {
        disputeBtn.textContent = 'Dispute';
      }

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
  const footer = document.getElementById('panelFooter');
  footer?.classList.add('is-loading');

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
  const effectiveStatus: DomainStatus = record?.vt_stats
    ? (isStale(record) ? 'unknown' : record.status)
    : 'unknown';

  // Inspector card surface
  const card = document.createElement('div');
  card.className = 'inspect-card';

  // Row 1: domain + verdict chip + freshness
  const summary = document.createElement('div');
  summary.className = 'inspect-card__summary';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'inspect-card__eyebrow';

  const eyebrowLabel = document.createElement('span');
  eyebrowLabel.className = 'inspect-card__eyebrow-label';
  eyebrowLabel.textContent = 'Current domain';
  eyebrow.appendChild(eyebrowLabel);

  if (record?.last_checked) {
    const fresh = document.createElement('span');
    fresh.className = 'freshness-chip';
    fresh.dataset.timestamp = String(record.last_checked);
    fresh.dataset.relativePrefix = 'Checked ';
    fresh.textContent = `Checked ${timeAgo(record.last_checked)}`;
    if (isStale(record)) fresh.classList.add('freshness-chip--stale');
    eyebrow.appendChild(fresh);
  }

  summary.appendChild(eyebrow);

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

  const verdictRow = document.createElement('div');
  verdictRow.className = 'inspect-card__verdict-row';

  const verdictCluster = document.createElement('div');
  verdictCluster.className = 'inspect-card__verdict';

  const verdictDot = document.createElement('span');
  verdictDot.className = `status-dot status-dot--${effectiveStatus}`;

  const verdictChip = document.createElement('span');
  verdictChip.className = `verdict-chip verdict-chip--${effectiveStatus}`;
  verdictChip.textContent = statusLabel(effectiveStatus);

  verdictCluster.append(verdictDot, verdictChip);
  verdictRow.appendChild(verdictCluster);
  summary.appendChild(verdictRow);

  // No API key → setup CTA
  if (!apiKey) {
    const headline = document.createElement('div');
    headline.className = 'inspect-card__headline inspect-card__headline--muted';
    headline.textContent = 'API key required to check this site';
    summary.appendChild(headline);

    const cta = document.createElement('div');
    cta.className = 'inspect-card__body';
    const hint = document.createElement('p');
    hint.className = 'inspect-card__hint';
    hint.textContent = 'Set up your API key to check domains';
    const setupBtn = document.createElement('button');
    setupBtn.className = 'btn btn--primary btn--sm';
    setupBtn.textContent = 'Open Setup';
    setupBtn.addEventListener('click', () => {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    });
    cta.append(hint, setupBtn);
    card.append(summary, cta);
    container.appendChild(card);
    return;
  }

  const headline = document.createElement('div');
  headline.className = `inspect-card__headline${!record?.vt_stats ? ' inspect-card__headline--muted' : ''}`;
  headline.textContent = currentSiteHeadline(record);
  summary.appendChild(headline);

  card.appendChild(summary);

  if (!record || !record.vt_stats) {
    const msg = document.createElement('div');
    msg.className = 'inspect-card__body';
    const hint = document.createElement('span');
    hint.className = 'inspect-card__hint';
    hint.textContent = `${_('notChecked', 'Not checked yet')}. Run a check to fetch the latest VirusTotal verdict for this domain.`;
    msg.appendChild(hint);
    card.appendChild(msg);
  } else {
    // Row 2: compact stats
    const stats = document.createElement('div');
    stats.className = 'inspect-card__stats';
    const items = [
      { label: 'Malicious', value: record.vt_stats.malicious, cls: record.vt_stats.malicious > 0 ? 'stat--bad' : '' },
      { label: 'Suspicious', value: record.vt_stats.suspicious, cls: record.vt_stats.suspicious > 0 ? 'stat--warn' : '' },
      { label: 'Harmless', value: record.vt_stats.harmless, cls: 'stat--ok' },
      { label: 'Undetected', value: record.vt_stats.undetected, cls: '' },
    ];
    for (const s of items) {
      const el = document.createElement('div');
      el.className = `inspect-card__stat ${s.cls}`;
      const label = document.createElement('span');
      label.className = 'inspect-card__stat-label';
      label.textContent = s.label;
      const value = document.createElement('strong');
      value.className = 'inspect-card__stat-value';
      value.textContent = String(s.value);
      el.append(label, value);
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

  // WHOIS row (compact icon chips)
  if (record?.whois) {
    const whoisRow = document.createElement('div');
    whoisRow.className = 'inspect-card__whois';

    const w = record.whois;
    if (w.registrar) {
      whoisRow.appendChild(createWhoisChip(
        'ico-dns',
        w.registrar.split(',')[0].substring(0, 20),
        `Registrar: ${w.registrar}`,
      ));
    }
    if (w.creation_date) {
      const date = new Date(w.creation_date);
      const isValid = !isNaN(date.getTime());
      whoisRow.appendChild(createWhoisChip(
        'ico-calendar-clock',
        isValid ? String(date.getFullYear()) : w.creation_date.substring(0, 10),
        `Created: ${w.creation_date}`,
      ));
    }
    if (w.expiration_date) {
      const date = new Date(w.expiration_date);
      const isValid = !isNaN(date.getTime());
      const isExpired = isValid && date.getTime() < Date.now();
      whoisRow.appendChild(createWhoisChip(
        'ico-clock',
        isValid ? date.toLocaleDateString() : w.expiration_date.substring(0, 10),
        `Expires: ${w.expiration_date}${isExpired ? ' (EXPIRED)' : ''}`,
        isExpired ? ' whois-chip--expired' : '',
      ));
    }
    if (w.name_servers.length > 0) {
      const chip = document.createElement('span');
      chip.className = 'whois-chip';
      chip.title = `NS: ${w.name_servers.join(', ')}`;
      chip.textContent = `NS: ${w.name_servers.length}`;
      whoisRow.appendChild(chip);
    }

    card.appendChild(whoisRow);
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
    footer?.classList.remove('is-loading');
  }
}

// --- Settings ---

// Settings moved to drawer — see components/settings-drawer.ts

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
  const mainFooter = document.getElementById('panelFooter');
  if (mainFooter) mainFooter.hidden = true;
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

// --- Queue activity indicator (from background, not storage) ---

let queuePollTimer: ReturnType<typeof setTimeout> | null = null;
let queueSnapshotInitialized = false;
let lastSeenCompletedBatchId = 0;

async function pollQueueStatus(): Promise<void> {
  const footerEl = document.getElementById('panelFooter');
  const queueBadge = document.getElementById('footerQueue');

  if (queuePollTimer) { clearTimeout(queuePollTimer); queuePollTimer = null; }

  try {
    const status = await sendMessage({ type: 'GET_QUEUE_STATUS' });
    const queueLength = status.length + (status.processing ? 1 : 0);
    const completedBatch = status.completedBatch ?? null;

    if (!queueSnapshotInitialized) {
      lastSeenCompletedBatchId = completedBatch?.id ?? 0;
      queueSnapshotInitialized = true;
    } else if (completedBatch && completedBatch.id > lastSeenCompletedBatchId) {
      const summary = formatBatchSummary(completedBatch);
      showToast(summary.message, summary.tone);
      lastSeenCompletedBatchId = completedBatch.id;
    }

    if (queueLength > 0) {
      footerEl?.classList.add('is-loading');
      if (queueBadge) {
        queueBadge.textContent = String(queueLength);
        queueBadge.title = `${queueLength} in queue`;
        queueBadge.hidden = false;
      }
      queuePollTimer = setTimeout(() => void pollQueueStatus(), 2000);
    } else {
      footerEl?.classList.remove('is-loading');
      if (queueBadge) queueBadge.hidden = true;

      // Queue just finished — toast once
    }
  } catch { /* background not ready */ }
}

function updateTokensBadge(): void {
  const tokensBadge = document.getElementById('footerTokens');
  if (!tokensBadge) return;
  void getApiUsage().then(usage => {
    tokensBadge.textContent = String(usage.count);
    tokensBadge.title = `${usage.count} / 500 API requests today`;
  });
}

// --- Live updates ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.DOMAINS]) {
    const newDomains = (changes[STORAGE_KEYS.DOMAINS].newValue || {}) as Record<string, DomainRecord>;
    renderWatchlist(newDomains);
    void renderCurrentSite();
    void pollQueueStatus();
  }
  if (area === 'local' && changes[STORAGE_KEYS.API_USAGE]) {
    void updateUsageDisplay();
    updateTokensBadge();
    void pollQueueStatus(); // usage change = a check just completed
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

  // Store rate link — browser-specific developer profile
  const storeLink = document.getElementById('storeRateLink') as HTMLAnchorElement | null;
  if (storeLink) {
    const isFirefox = typeof (browser as any).runtime.getBrowserInfo === 'function';
    const isEdge = navigator.userAgent.includes('Edg/');
    if (isFirefox) {
      storeLink.href = 'https://addons.mozilla.org/en-US/firefox/user/19709072/';
    } else if (isEdge) {
      storeLink.href = 'https://microsoftedge.microsoft.com/addons/search?developer=SpinTax';
    } else {
      storeLink.href = 'https://chromewebstore.google.com/search/301.st';
    }
    storeLink.hidden = false;
  }

  const domains = await getDomains();
  renderWatchlist(domains);
  void pollQueueStatus();
  updateTokensBadge();
  await renderCurrentSite();
  // Settings drawer button
  document.getElementById('btnOpenSettings')?.addEventListener('click', openSettingsDrawer);

  // Default view: Current Site, but if unsupported page → show Watchlist
  const ctxTab = await getContextTab();
  const ctxDomain = ctxTab?.url ? extractDomain(ctxTab.url) : null;
  if (ctxDomain) {
    showView('current');
  } else {
    showView('watchlist');
  }

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
    if (area === 'sync' && changes[STORAGE_KEYS.PAUSE_UNTIL]) {
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
        const prefix = el.dataset.relativePrefix || '';
        el.textContent = prefix + timeAgo(ts);
      }
    });
  }, 60_000);
})();
