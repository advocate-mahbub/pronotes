import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy as a <meta> tag in the production build, for hosts that cannot send
 * headers (GitHub Pages). Same rules as public/_headers, minus frame-ancestors (not allowed in
 * <meta>). Not added to the single-file claude.ai preview, which inlines its script.
 */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; " +
  "connect-src 'self' data: blob: https://generativelanguage.googleapis.com; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";
const cspMeta = (): Plugin => ({
  name: 'pronotes-csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => {
    if (process.env.PRONOTES_PREVIEW) return html;
    // any spelling of the charset tag (utf-8 / UTF-8, with or without the closing slash)
    const out = html.replace(/<meta\s+charset=["']?utf-8["']?\s*\/?>/i, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    // never ship a build without the policy: stop the build instead
    if (out === html) throw new Error('pronotes-csp-meta: <meta charset> not found in index.html, CSP was not added');
    return out;
  },
});

// base './' so the build also works from a sub-folder (e.g. GitHub Pages project site).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      // The app asks before updating (a reload must never cut off an unsaved draft).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'ProNotes – বাংলা আইনি ড্রাফট',
        short_name: 'ProNotes',
        description: 'Bornona কিবোর্ডে বাংলা আইনি ড্রাফট, Word ফাইল ও প্রিন্ট। সব লেখা এই ডিভাইসেই থাকে।',
        lang: 'bn',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f5efe3',
        theme_color: '#0f2a4f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // everything the app needs offline, fonts included (woff2 only; every current browser uses it)
        globPatterns: ['**/*.{js,css,html,png,woff2}', 'dict/*.txt'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // the Bangla word list is ~4 MB (≈0.6 MB compressed)
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true },
  // single-bundle build for the claude.ai preview (tools/make-preview.mjs)
  build: process.env.PRONOTES_PREVIEW ? { outDir: 'dist-preview/build', rolldownOptions: { output: { codeSplitting: false } } } : {},
});
