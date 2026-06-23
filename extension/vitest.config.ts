import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(extensionRoot, '..');

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.join(repoRoot, 'shared'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Pretend we're on facebook.com so window.history.replaceState() can
        // freely change the URL within tests without tripping jsdom's
        // same-origin guard.
        url: 'https://www.facebook.com/',
      },
    },
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
