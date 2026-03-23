import { browser } from 'wxt/browser';
import { applyI18n } from '@shared/i18n';
import { initTheme } from '@shared/theme';
import { sendMessage } from '@shared/messaging';
import { getApiKey } from '@shared/db';
import { normalizeDomainInput } from '@shared/domain-utils';

initTheme();
applyI18n();

const steps = [
  document.getElementById('step1')!,
  document.getElementById('step2')!,
  document.getElementById('step3')!,
  document.getElementById('stepDone')!,
];
const progressFill = document.getElementById('progressFill')!;
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const keyStatus = document.getElementById('keyStatus')!;
const btnVerifyKey = document.getElementById('btnVerifyKey') as HTMLButtonElement;
const btnNextStep2 = document.getElementById('btnNextStep2') as HTMLButtonElement;
const domainInput = document.getElementById('domainInput') as HTMLInputElement;

let keyVerified = false;

function showStep(n: number): void {
  steps.forEach((s, i) => {
    s.hidden = i !== n;
  });
  const pct = Math.round(((n + 1) / steps.length) * 100);
  progressFill.style.width = `${pct}%`;
}

// Check if key already saved
void (async () => {
  const key = await getApiKey();
  if (key) {
    keyVerified = true;
  }
})();

// Step 1 → Step 2
document.getElementById('btnGetStarted')!.addEventListener('click', () => {
  if (keyVerified) {
    showStep(2); // skip to step 3
  } else {
    showStep(1);
  }
});

// Step 2: Verify key
btnVerifyKey.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  btnVerifyKey.disabled = true;
  keyStatus.textContent = '...';
  keyStatus.className = 'key-status';

  void sendMessage({ type: 'VERIFY_KEY', key }).then(result => {
    btnVerifyKey.disabled = false;
    if (result.ok) {
      keyStatus.textContent = '\u2713 Key valid';
      keyStatus.className = 'key-status inline-msg is-visible inline-msg--success';
      keyVerified = true;
      btnNextStep2.disabled = false;
    } else {
      keyStatus.textContent = '\u2717 Invalid key \u2014 check and try again';
      keyStatus.className = 'key-status inline-msg is-visible inline-msg--error';
    }
  }).catch(() => {
    btnVerifyKey.disabled = false;
    keyStatus.textContent = 'Connection error';
    keyStatus.className = 'key-status inline-msg is-visible inline-msg--error';
  });
});

// Step 2 → Step 3
btnNextStep2.addEventListener('click', () => showStep(2));

// Step 3: Add domain
document.getElementById('btnAddDomain')!.addEventListener('click', () => {
  const domain = normalizeDomainInput(domainInput.value);
  const domainStatus = document.getElementById('domainStatus')!;
  if (!domain) {
    domainStatus.textContent = 'Enter a valid domain';
    domainStatus.className = 'domain-status inline-msg is-visible inline-msg--error';
    return;
  }
  void sendMessage({ type: 'ADD_DOMAIN', domain }).then(() => {
    showStep(3); // done
  }).catch(() => {
    showStep(3);
  });
});

// Skip
document.getElementById('btnSkip')!.addEventListener('click', () => showStep(3));

// Done: Open panel
document.getElementById('btnOpenPanel')!.addEventListener('click', () => {
  try {
    const sa = (browser as any).sidebarAction;
    if (sa?.open) { void sa.open(); return; }
  } catch { /* not Firefox */ }
  void sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {});
});
