import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(extensionRoot, '..');

function bundleContentScripts(): Plugin {
  return {
    name: 'worthit-bundle-content-scripts',
    async closeBundle() {
      await esbuild.build({
        entryPoints: [path.join(extensionRoot, 'src/content/analyze-runtime.ts')],
        absWorkingDir: repoRoot,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        outfile: path.join(extensionRoot, 'dist/assets/worthit-main.js'),
      });
      await esbuild.build({
        entryPoints: [path.join(extensionRoot, 'src/content/passive-collect.ts')],
        absWorkingDir: repoRoot,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        outfile: path.join(extensionRoot, 'dist/assets/worthit-passive.js'),
      });
    },
  };
}

export default defineConfig({
  root: extensionRoot,
  resolve: {
    alias: {
      '@shared': path.join(repoRoot, 'shared'),
    },
  },
  plugins: [crx({ manifest }), bundleContentScripts()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
