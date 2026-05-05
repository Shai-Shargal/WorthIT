import esbuild from 'esbuild';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

const root = process.cwd();

function bundleScoreRuntime(): Plugin {
  return {
    name: 'worthit-bundle-score-runtime',
    async closeBundle() {
      await esbuild.build({
        entryPoints: [path.join(root, 'src/score-runtime.ts')],
        absWorkingDir: root,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        outfile: path.join(root, 'dist/assets/worthit-main.js'),
      });
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), bundleScoreRuntime()],
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
