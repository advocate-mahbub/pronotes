import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the build also works from a sub-folder (e.g. GitHub Pages project site).
export default defineConfig({
  base: './',
  plugins: [
    react(),
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
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true },
  // single-bundle build for the claude.ai preview (tools/make-preview.mjs)
  build: process.env.PRONOTES_PREVIEW ? { outDir: 'dist-preview/build', rolldownOptions: { output: { codeSplitting: false } } } : {},
});
