import { browser } from 'wxt/browser';
import { el } from '@shared/ui-helpers';
import { sendMessage } from '@shared/messaging';
import { _ } from '@shared/i18n';
import {
  getApiKey, saveApiKey, getCheckInterval, saveCheckInterval,
  getApiUsage, getRescanPolicy, saveRescanPolicy,
  getExcludedDomains, saveExcludedDomains,
} from '@shared/db';
import { DEFAULT_EXCLUDED_DOMAINS } from '@shared/constants';
import { createDrawer } from './drawer';
import type { CheckInterval, RescanPolicy } from '@shared/types';

export function openSettingsDrawer(): void {
  const { aside, body, footer } = createDrawer('Settings', () => {});

  void (async () => {
    // --- API ---
    const apiSection = el('fieldset', 'vt-fieldset');
    apiSection.innerHTML = '<legend>API</legend>';

    const keyField = el('div', 'field');
    const keyLabel = el('label', 'field__label', _('apiKeyLabel', 'VirusTotal API Key'));
    const keyRow = el('div', 'domain-form__row');
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.className = 'input';
    keyInput.autocomplete = 'off';
    const key = await getApiKey();
    if (key) keyInput.value = key;

    const verifyBtn = el('button', 'btn btn--outline btn--sm', _('verifyKeyBtn', 'Verify'));
    verifyBtn.type = 'button';
    keyRow.append(keyInput, verifyBtn);
    keyField.append(keyLabel, keyRow);

    const keyStatus = el('div', 'inline-msg');

    verifyBtn.addEventListener('click', () => {
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

    const usage = await getApiUsage();
    const usageEl = el('div', 'api-usage', `${usage.count} / 500 ${_('apiUsageLabel', 'API usage today')}`);
    usageEl.id = 'apiUsageDisplay';

    apiSection.append(keyField, keyStatus, usageEl);
    body.appendChild(apiSection);

    // --- Schedule ---
    const schedSection = el('fieldset', 'vt-fieldset');
    schedSection.innerHTML = '<legend>Schedule</legend>';

    const intervalField = el('div', 'field');
    const intervalLabel = el('label', 'field__label', _('checkIntervalLabel', 'Check interval'));
    const intervalSelect = document.createElement('select');
    intervalSelect.className = 'input';
    for (const [val, text] of [['12', '12 hours'], ['24', '24 hours'], ['72', '3 days'], ['168', '7 days']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      intervalSelect.appendChild(opt);
    }
    const interval = await getCheckInterval();
    intervalSelect.value = String(interval);
    intervalSelect.addEventListener('change', () => {
      void saveCheckInterval(Number(intervalSelect.value) as CheckInterval);
    });
    intervalField.append(intervalLabel, intervalSelect);

    const rescanField = el('div', 'field');
    const rescanLabel = el('label', 'field__label', 'Rescan policy');
    const rescanSelect = document.createElement('select');
    rescanSelect.className = 'input';
    for (const [val, text] of [['never', 'Never rescan'], ['stale30', 'Auto-rescan if stale (30d)'], ['stale7', 'Auto-rescan if stale (7d)'], ['always', 'Always rescan']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      rescanSelect.appendChild(opt);
    }
    const rescanPolicy = await getRescanPolicy();
    rescanSelect.value = rescanPolicy;
    rescanSelect.addEventListener('change', () => {
      void saveRescanPolicy(rescanSelect.value as RescanPolicy);
    });
    rescanField.append(rescanLabel, rescanSelect);

    const checkAllBtn = el('button', 'btn btn--outline btn--sm', _('checkAllBtn', 'Check all now'));
    checkAllBtn.type = 'button';
    checkAllBtn.addEventListener('click', () => {
      void sendMessage({ type: 'CHECK_ALL' });
    });

    schedSection.append(intervalField, rescanField, checkAllBtn);
    body.appendChild(schedSection);

    // --- Excluded Domains ---
    const excludeSection = el('fieldset', 'vt-fieldset');
    excludeSection.innerHTML = '<legend>Excluded Domains</legend>';

    const excludeTextarea = document.createElement('textarea');
    excludeTextarea.className = 'bulk-textarea';
    excludeTextarea.rows = 3;
    excludeTextarea.placeholder = 'google.com, youtube.com, ...';
    const excludedList = await getExcludedDomains();
    excludeTextarea.value = excludedList.join(', ');

    let debounce: ReturnType<typeof setTimeout> | null = null;
    excludeTextarea.addEventListener('input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const domains = excludeTextarea.value
          .split(/[,\n\s]+/)
          .map(d => d.trim().toLowerCase())
          .filter(d => d && d.includes('.'));
        void saveExcludedDomains(domains);
      }, 500);
    });

    const resetBtn = el('button', 'btn btn--ghost btn--sm', 'Reset to defaults');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      void saveExcludedDomains([...DEFAULT_EXCLUDED_DOMAINS]);
      excludeTextarea.value = DEFAULT_EXCLUDED_DOMAINS.join(', ');
    });

    excludeSection.append(excludeTextarea, resetBtn);
    body.appendChild(excludeSection);

    // --- Help ---
    const helpSection = el('fieldset', 'vt-fieldset');
    helpSection.innerHTML = '<legend>Help</legend>';

    const setupBtn = el('button', 'btn btn--ghost btn--sm', _('setupGuideBtn', 'Setup guide'));
    setupBtn.type = 'button';
    setupBtn.addEventListener('click', () => {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    });
    helpSection.appendChild(setupBtn);
    body.appendChild(helpSection);

    // --- Footer: About ---
    const about = el('div', 'drawer__about');
    about.innerHTML = [
      '<div style="font-size: 10px; color: var(--text-subtle); display: flex; flex-direction: column; gap: var(--space-2);">',
      '<div><strong>VirusTotal Domain Monitor</strong> v1.0.0</div>',
      '<div>Domain reputation monitoring tool for webmasters.</div>',
      '<div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">',
      '<a href="https://301.st" target="_blank" rel="noreferrer" style="color: var(--primary); text-decoration: none;">301.st</a>',
      '<a href="https://t.me/traffic301" target="_blank" rel="noreferrer" style="color: var(--primary); text-decoration: none;">Telegram</a>',
      '</div>',
      '</div>',
    ].join('');
    footer.appendChild(about);

    document.body.appendChild(aside);
  })();
}
