import { el } from '@shared/ui-helpers';
import { getVendorContact } from '@shared/vendors';
import { generateDisputeText, generateMailtoLink, generateAiPrompt } from '@shared/dispute-templates';
import { getDomain, saveDomain } from '@shared/db';
import { toUnicode } from '@shared/domain-utils';
import { createDrawer } from './drawer';
import type { VtVendorResult, DisputeStatus, DomainRecord } from '@shared/types';

function statusIcon(status: DisputeStatus): string {
  switch (status) {
    case 'disputed': return '\u25d4';  // ◔
    case 'resolved': return '\u25cf';  // ●
    default: return '\u25cb';          // ○
  }
}

function statusLabel(status: DisputeStatus): string {
  switch (status) {
    case 'disputed': return 'Disputed';
    case 'resolved': return 'Resolved';
    default: return 'Not disputed';
  }
}

async function cycleDisputeStatus(domain: string, vendor: string, statusEl: HTMLElement): Promise<void> {
  const record = await getDomain(domain);
  if (!record) return;

  const disputes = record.disputes ?? {};
  const current = disputes[vendor] ?? 'none';
  const next: DisputeStatus = current === 'none' ? 'disputed' : current === 'disputed' ? 'resolved' : 'none';
  disputes[vendor] = next;

  const updated: DomainRecord = { ...record, disputes };
  await saveDomain(updated);

  statusEl.textContent = `${statusIcon(next)} ${statusLabel(next)}`;
  statusEl.className = `vendor-card__status vendor-card__status--${next}`;
}

/**
 * Open the Dispute False Positive drawer for a domain.
 */
export function openDisputeDrawer(domain: string, vendors: VtVendorResult[], disputes: Record<string, DisputeStatus> | undefined): void {
  const flagged = vendors.filter(v => v.category === 'malicious' || v.category === 'suspicious');
  const displayDomain = toUnicode(domain);

  const { aside, body, footer } = createDrawer(
    `${displayDomain} \u2014 flagged by ${flagged.length} vendor${flagged.length !== 1 ? 's' : ''}`,
    () => {},
  );

  // Vendor cards
  for (const vendor of flagged) {
    const card = el('div', 'vendor-card');

    // Header: vendor name + verdict
    const header = el('div', 'vendor-card__header');
    const dot = el('span', vendor.category === 'malicious' ? 'status-dot status-dot--malicious' : 'status-dot status-dot--suspicious');
    const name = el('span', 'vendor-card__name', vendor.vendor);
    const verdict = el('span', 'vendor-card__verdict', `\u2014 "${vendor.result}"`);
    header.append(dot, name, verdict);

    // Actions
    const actions = el('div', 'vendor-card__actions');
    const contact = getVendorContact(vendor.vendor);

    if (contact?.url) {
      const formBtn = el('a', 'btn btn--outline btn--sm') as HTMLAnchorElement;
      formBtn.href = contact.url;
      formBtn.target = '_blank';
      formBtn.rel = 'noreferrer';
      formBtn.innerHTML = '<svg width="14" height="14" style="vertical-align:-2px"><use href="#ico-open-in-new"/></svg> Dispute form';
      actions.appendChild(formBtn);
    }

    if (contact?.email) {
      const mailBtn = el('a', 'btn btn--ghost btn--sm') as HTMLAnchorElement;
      mailBtn.href = generateMailtoLink(contact.email, vendor.vendor, domain, vendor.result);
      mailBtn.textContent = '\u2709 Email';
      actions.appendChild(mailBtn);
    }

    if (!contact) {
      const noContact = el('span', 'vendor-card__no-contact', 'No contact info');
      actions.appendChild(noContact);
    }

    // Dispute status (clickable to cycle)
    const currentStatus = disputes?.[vendor.vendor] ?? 'none';
    const statusEl = el('button', `vendor-card__status vendor-card__status--${currentStatus}`);
    statusEl.type = 'button';
    statusEl.textContent = `${statusIcon(currentStatus)} ${statusLabel(currentStatus)}`;
    statusEl.addEventListener('click', () => {
      void cycleDisputeStatus(domain, vendor.vendor, statusEl);
    });

    // Text preview with tabs: Template | AI Prompt
    const templateText = generateDisputeText(vendor.vendor, domain, vendor.result);
    const promptText = generateAiPrompt(vendor.vendor, domain, vendor.result);

    const textBlock = el('div', 'vendor-card__text-block');

    const tabBar = el('div', 'vendor-card__tabs');
    const tabTemplate = el('button', 'vendor-card__tab is-active', 'Template');
    tabTemplate.type = 'button';
    const tabPrompt = el('button', 'vendor-card__tab', 'AI Prompt');
    tabPrompt.type = 'button';
    tabBar.append(tabTemplate, tabPrompt);

    const preview = el('pre', 'vendor-card__preview');
    preview.textContent = templateText;

    const copyBtn = el('button', 'btn btn--sm btn--outline copy-flash');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';

    let activeText = templateText;

    tabTemplate.addEventListener('click', () => {
      tabTemplate.classList.add('is-active');
      tabPrompt.classList.remove('is-active');
      preview.textContent = templateText;
      activeText = templateText;
    });

    tabPrompt.addEventListener('click', () => {
      tabPrompt.classList.add('is-active');
      tabTemplate.classList.remove('is-active');
      preview.textContent = promptText;
      activeText = promptText;
    });

    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(activeText).then(() => {
        copyBtn.classList.add('is-copied');
        copyBtn.textContent = '\u2713 Copied';
        setTimeout(() => {
          copyBtn.classList.remove('is-copied');
          copyBtn.textContent = 'Copy';
        }, 2000);
      });
    });

    textBlock.append(tabBar, preview, copyBtn);

    card.append(header, actions, textBlock, statusEl);
    body.appendChild(card);
  }

  // Footer
  const tip = el('div', 'drawer__tip', 'Tip: After vendors remove the flag, request a VT rescan on the domain page.');
  footer.appendChild(tip);

  document.body.appendChild(aside);
}
