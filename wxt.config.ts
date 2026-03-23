import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  vite: () => ({
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  }),

  manifest: ({ browser }) => ({
    name: 'VirusTotal Domain Monitor',
    description: 'Monitor domain reputation via VirusTotal API — watchlist with scheduled checks and badge indicator',

    permissions: (browser === 'firefox')
      ? ['storage', 'alarms', 'tabs', 'activeTab']
      : ['storage', 'alarms', 'tabs', 'activeTab', 'sidePanel'],

    host_permissions: ['https://www.virustotal.com/*'],

    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },

    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },

    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'vt-domain-monitor@example.com',
          strict_min_version: '128.0',
        },
      },
    }),
  }),

  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Chrome/Edge: remove popup — icon click opens sidePanel via onClicked
      if (wxt.config.browser === 'chrome') {
        if (manifest.action) {
          delete manifest.action.default_popup;
        }
        const sp = (manifest as unknown as Record<string, any>).side_panel;
        if (sp) sp.default_path = 'sidepanel.html#sidebar';
      }

      // Firefox: sidepanel.html doubles as popup + sidebar
      if (wxt.config.browser === 'firefox') {
        // AMO requires data_collection_permissions (mandatory H1 2026)
        if (manifest.browser_specific_settings?.gecko) {
          (manifest.browser_specific_settings.gecko as Record<string, unknown>)
            .data_collection_permissions = { required: ['none'] };
        }
        if (manifest.action) {
          manifest.action.default_popup = 'sidepanel.html';
        }
        const sidebar = (manifest as unknown as Record<string, any>).sidebar_action;
        if (sidebar) {
          sidebar.default_icon = 'icons/icon-48.png';
          sidebar.default_panel = 'sidepanel.html#sidebar';
        }
      }
    },
  },

  browser: 'chrome',
});
