import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { CSP } from './csp.ts';

/**
 * Writes the Content-Security-Policy into the built index.html.
 *
 * Build only: the dev server needs a WebSocket for hot reload, which
 * `connect-src 'none'` forbids. Every privacy check runs against the build.
 */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Relative, so the same build works at a domain root and under /repo-name/ on GitHub Pages.
  base: './',
  plugins: [cspMeta()],
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    // The polyfill preloads chunks with fetch(), which the policy blocks by design.
    modulePreload: { polyfill: false },
    // Nothing is inlined as a data: URI, so the policy needs no `data:` source.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/*.test.ts'],
    restoreMocks: true,
  },
});
