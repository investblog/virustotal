import { el } from '@shared/ui-helpers';
import { parseBulkInput } from '@shared/bulk-parser';
import { getDomains, getApiUsage } from '@shared/db';
import { sendMessage } from '@shared/messaging';
import { _ } from '@shared/i18n';
import { createDrawer } from './drawer';
import type { BulkParseResult } from '@shared/bulk-parser';

interface PreflightResult extends BulkParseResult {
  alreadyInWatchlist: string[];
  newDomains: string[];
}

async function preflight(parsed: BulkParseResult): Promise<PreflightResult> {
  const domains = await getDomains();
  const alreadyInWatchlist: string[] = [];
  const newDomains: string[] = [];

  for (const domain of parsed.valid) {
    if (domains[domain]?.watchlist) {
      alreadyInWatchlist.push(domain);
    } else {
      newDomains.push(domain);
    }
  }

  return {
    ...parsed,
    alreadyInWatchlist,
    newDomains,
  };
}

function renderSummary(container: HTMLElement, result: PreflightResult): void {
  container.replaceChildren();

  const items: { label: string; count: number; cls: string }[] = [
    { label: 'Valid (new)', count: result.newDomains.length, cls: 'bulk-summary__count--valid' },
    { label: 'Already in watchlist', count: result.alreadyInWatchlist.length, cls: 'bulk-summary__count--exists' },
    { label: 'Duplicate', count: result.duplicate.length, cls: 'bulk-summary__count--duplicate' },
    { label: 'Invalid', count: result.invalid.length, cls: 'bulk-summary__count--invalid' },
  ];

  for (const item of items) {
    if (item.count === 0) continue;
    const span = el('div', 'bulk-summary__item');
    const count = el('span', `bulk-summary__count ${item.cls}`, String(item.count));
    span.append(count, document.createTextNode(` ${item.label}`));
    container.appendChild(span);
  }
}

/**
 * Open the Bulk Add drawer.
 * Textarea → live parsing → preflight → add + optional check.
 */
export function openBulkAddDrawer(): void {
  const { aside, body, footer } = createDrawer('Bulk Add Domains', () => {});

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'bulk-textarea';
  textarea.placeholder = 'Paste domains, URLs, or mixed text\u2026\none per line, comma or space separated';
  textarea.rows = 6;

  // Summary
  const summary = el('div', 'bulk-summary');

  // Estimate
  const estimate = el('div', 'bulk-estimate');

  body.append(textarea, summary, estimate);

  // Footer actions
  const addOnlyBtn = el('button', 'btn btn--outline', 'Add only');
  addOnlyBtn.type = 'button';
  addOnlyBtn.disabled = true;

  const addCheckBtn = el('button', 'btn btn--primary', 'Add + check now');
  addCheckBtn.type = 'button';
  addCheckBtn.disabled = true;

  const actions = el('div', 'bulk-actions');
  actions.append(addOnlyBtn, addCheckBtn);
  footer.appendChild(actions);

  // State
  let lastResult: PreflightResult | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function updatePreflight(): Promise<void> {
    const text = textarea.value;
    if (!text.trim()) {
      summary.replaceChildren();
      estimate.textContent = '';
      addOnlyBtn.disabled = true;
      addCheckBtn.disabled = true;
      lastResult = null;
      return;
    }

    const parsed = parseBulkInput(text);
    const result = await preflight(parsed);
    lastResult = result;

    renderSummary(summary, result);

    const newCount = result.newDomains.length;
    addOnlyBtn.disabled = newCount === 0;
    addCheckBtn.disabled = newCount === 0;

    if (newCount > 0) {
      const usage = await getApiUsage();
      const remaining = Math.max(0, 500 - usage.count);
      const checkCount = Math.min(newCount, 20);
      estimate.textContent = `Estimated API cost: ${checkCount} requests (${remaining} remaining today)`;
    } else {
      estimate.textContent = '';
    }
  }

  textarea.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void updatePreflight(); }, 300);
  });

  // Add only (no check)
  addOnlyBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.newDomains.length) return;
    addOnlyBtn.classList.add('btn--loading');
    void sendMessage({ type: 'BULK_ADD', domains: lastResult.newDomains, checkNow: false })
      .then(() => aside.remove())
      .catch(() => aside.remove());
  });

  // Add + check now
  addCheckBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.newDomains.length) return;
    addCheckBtn.classList.add('btn--loading');
    void sendMessage({ type: 'BULK_ADD', domains: lastResult.newDomains, checkNow: true })
      .then(() => aside.remove())
      .catch(() => aside.remove());
  });

  document.body.appendChild(aside);
  textarea.focus();
}
