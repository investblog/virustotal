export function _(id: string, fallback = '', subs?: string[]): string {
  try {
    return chrome.i18n.getMessage(id, subs) || fallback;
  } catch {
    return fallback;
  }
}

export function applyI18n(): void {
  const attrs: [string, (el: Element, msg: string) => void][] = [
    ['data-i18n', (el, msg) => { el.textContent = msg; }],
    ['data-i18n-placeholder', (el, msg) => { (el as HTMLInputElement).placeholder = msg; }],
    ['data-i18n-title', (el, msg) => { (el as HTMLElement).title = msg; }],
    ['data-i18n-aria-label', (el, msg) => { el.setAttribute('aria-label', msg); }],
  ];

  for (const [attr, apply] of attrs) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      const key = el.getAttribute(attr);
      if (!key) continue;
      const msg = _(key);
      if (msg) apply(el, msg);
    }
  }
}
