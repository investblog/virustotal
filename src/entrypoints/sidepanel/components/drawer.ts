import { el } from '@shared/ui-helpers';

export interface DrawerElements {
  aside: HTMLElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
}

/**
 * Create a reusable slide-in drawer panel.
 * Pattern from redirect-inspector: overlay + panel with slide-in animation.
 *
 * Usage:
 *   const { aside, body, footer } = createDrawer('Title', () => cleanup());
 *   body.appendChild(yourContent);
 *   document.body.appendChild(aside);
 */
export function createDrawer(title: string, onClose: () => void): DrawerElements {
  const aside = el('aside', 'drawer');
  const overlay = el('div', 'drawer__overlay');
  const panel = el('div', 'drawer__panel');

  // Header
  const header = el('div', 'drawer__header');
  const headerTitle = el('h2', 'drawer__title', title);

  const closeBtn = el('button', 'drawer__close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M17 4.41 15.59 3 10 8.59 4.41 3 3 4.41 8.59 10 3 15.59 4.41 17 10 11.41 15.59 17 17 15.59 11.41 10z" fill="currentColor"/></svg>';

  header.append(headerTitle, closeBtn);

  // Body (scrollable content area)
  const body = el('div', 'drawer__body');

  // Footer
  const footer = el('div', 'drawer__footer');

  panel.append(header, body, footer);
  aside.append(overlay, panel);

  // Escape key handler (registered once, cleaned up in close)
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  // Single close path — always cleans up listener
  function close(): void {
    document.removeEventListener('keydown', onKeyDown);
    aside.remove();
    onClose();
  }

  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);

  return { aside, body, footer };
}
