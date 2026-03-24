import { el } from '@shared/ui-helpers';
import { getVendorContact } from '@shared/vendors';
import { generateDisputeText, generateMailtoLink, generateAiPrompt } from '@shared/dispute-templates';
import { getDomain, saveDomain } from '@shared/db';
import { toUnicode } from '@shared/domain-utils';
import { createDrawer } from './drawer';
import type { VtVendorResult, DisputeStatus, DomainRecord } from '@shared/types';

async function saveDisputeStatus(domain: string, vendor: string, status: DisputeStatus): Promise<void> {
  const record = await getDomain(domain);
  if (!record) return;
  const disputes = record.disputes ?? {};
  disputes[vendor] = status;
  await saveDomain({ ...record, disputes });
}

function createStatusSelect(domain: string, vendor: string, current: DisputeStatus): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = `input input--sm dispute-status dispute-status--${current}`;

  const options: { value: DisputeStatus; label: string }[] = [
    { value: 'none', label: 'Not disputed' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'resolved', label: 'Resolved' },
  ];

  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === current) o.selected = true;
    select.appendChild(o);
  }

  select.addEventListener('change', () => {
    const val = select.value as DisputeStatus;
    select.className = `input input--sm dispute-status dispute-status--${val}`;
    void saveDisputeStatus(domain, vendor, val);
  });

  return select;
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
      mailBtn.innerHTML = '<svg width="14" height="14" style="vertical-align:-2px"><use href="#ico-email"/></svg> Email';
      actions.appendChild(mailBtn);
    }

    if (!contact) {
      const noContact = el('span', 'vendor-card__no-contact', 'No contact info');
      actions.appendChild(noContact);
    }

    // Dispute status (clickable to cycle)
    const currentStatus = disputes?.[vendor.vendor] ?? 'none';
    const statusSelect = createStatusSelect(domain, vendor.vendor, currentStatus);

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

    card.append(header, actions, textBlock, statusSelect);
    body.appendChild(card);
  }

  // Footer
  const tip = el('div', 'drawer__tip', 'Tip: After vendors remove the flag, request a VT rescan on the domain page.');
  footer.appendChild(tip);

  document.body.appendChild(aside);
}
