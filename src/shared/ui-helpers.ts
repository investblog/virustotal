/**
 * Shorthand DOM element creator (pattern from redirect-inspector).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  if (className) elem.className = className;
  if (text) elem.textContent = text;
  return elem;
}

/**
 * Show a toast notification in the sidepanel.
 * Requires a #toastContainer element in the DOM.
 */
export function showToast(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', durationMs = 4000): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove());
  }, durationMs);
}
