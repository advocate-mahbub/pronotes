import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build also works from a sub-folder (e.g. GitHub Pages project site).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
