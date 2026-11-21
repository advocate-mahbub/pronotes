import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

// ProNotes is never shown inside another site's frame: GitHub Pages cannot send X-Frame-Options, and a
// <meta> CSP cannot say frame-ancestors, so a page in a frame stays blank (clickjacking; decisions.md 93)
let framed = false;
try { framed = window.top !== window.self; } catch { framed = true; }
if (framed) throw new Error('ProNotes does not run inside a frame');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
