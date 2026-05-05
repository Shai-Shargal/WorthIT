import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'WorthIT Marketplace Scorer',
  description: 'Score Facebook Marketplace listings against market data, in-place.',
  version: '0.1.0',
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'WorthIT - Score this page',
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
      // Plain public/ script (no CRX loader) so messaging works as soon as the script runs.
      js: ['src/worthit-bridge.js'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: [
    'https://www.facebook.com/*',
    'https://facebook.com/*',
    'https://web.facebook.com/*',
    'http://localhost:4000/*',
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
