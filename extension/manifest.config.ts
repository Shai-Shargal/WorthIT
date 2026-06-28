import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'WorthIT',
  description: 'Analyze whether a second-hand marketplace listing is worth buying.',
  version: '0.2.0',
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'WorthIT — Analyze Product',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://www.facebook.com/marketplace/*',
        'https://facebook.com/marketplace/*',
        'https://web.facebook.com/marketplace/*',
      ],
      js: ['src/content/worthit-bridge.js'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
  host_permissions: [
    'https://www.facebook.com/*',
    'https://facebook.com/*',
    'https://web.facebook.com/*',
    'https://worthit-backend-sandy.vercel.app/*',
  ],
  web_accessible_resources: [
    {
      matches: [
        'https://www.facebook.com/*',
        'https://facebook.com/*',
        'https://web.facebook.com/*',
      ],
      resources: ['assets/*'],
    },
  ],
});
