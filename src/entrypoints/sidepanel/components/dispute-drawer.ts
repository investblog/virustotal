import { el } from '@shared/ui-helpers';
import { getVendorContact } from '@shared/vendors';
import { generateDisputeText, generateMailtoLink } from '@shared/dispute-templates';
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

    const copyBtn = el('button', 'btn btn--ghost btn--sm copy-flash');
    copyBtn.type = 'button';
    copyBtn.textContent = '\u2398 Copy text';
    copyBtn.addEventListener('click', () => {
      const text = generateDisputeText(vendor.vendor, domain, vendor.result);
      void navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('is-copied');
        copyBtn.textContent = '\u2713 Copied';
        setTimeout(() => {
          copyBtn.classList.remove('is-copied');
          copyBtn.textContent = '\u2398 Copy text';
        }, 2000);
      });
    });
    actions.appendChild(copyBtn);

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

    card.append(header, actions, statusEl);
    body.appendChild(card);
  }

  // Footer
  const tip = el('div', 'drawer__tip', 'Tip: After vendors remove the flag, request a VT rescan on the domain page.');
  footer.appendChild(tip);

  document.body.appendChild(aside);
}
