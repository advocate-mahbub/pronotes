/**
 * ▦ → আমার অ্যাপ (decisions.md 81): the user's own web apps, added as .zip files. They run on a separate
 * address (apps.mahbuburrahman.bd), shown here in a frame, so no app can read ProNotes' drafts, settings
 * or keys. ProNotes sends each app page its keyboard layout and typing rules (the bridge there types
 * Bangla in the app's text boxes) and switches the language when an app page asks (Ctrl+Space there).
 */
import { useEffect, useRef } from 'react';
import type { BridgeConfig, FromApp } from '../../apps-site/protocol';
import { useT } from '../i18n';

/** Where the apps site is: the real one, or the local test copy (npm run preview:apps). */
export function appsOrigin(loc: { hostname: string } = location): string {
  return loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' ? 'http://localhost:4174' : 'https://apps.mahbuburrahman.bd';
}

interface Props {
  cfg: BridgeConfig;
  onToggleLanguage: () => void;
}

export function UserApps({ cfg, onToggleLanguage }: Props) {
  const { t, lang } = useT();
  const origin = appsOrigin();
  // every app page that said hello (an app can have several frames or pages)
  const pages = useRef(new Set<MessageEventSource>());
  const cfgNow = useRef(cfg);
  cfgNow.current = cfg;
  const toggle = useRef(onToggleLanguage);
  toggle.current = onToggleLanguage;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || !e.source) return;
      const d = e.data as FromApp | null;
      if (d?.pn === 'hello') {
        pages.current.add(e.source);
        (e.source as Window).postMessage({ pn: 'cfg', cfg: cfgNow.current }, origin);
      } else if (d?.pn === 'toggle') toggle.current();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  // a new layout or language: to every app page at once
  useEffect(() => {
    for (const w of [...pages.current]) {
      try { (w as Window).postMessage({ pn: 'cfg', cfg }, origin); } catch { pages.current.delete(w); }
    }
  }, [cfg, origin]);

  const src = `${origin}/?host=${encodeURIComponent(location.origin)}&lang=${lang}`;
  return (
    <div className="craft-stage user-apps">
      <iframe className="craft-frame" title={t('আমার অ্যাপ')} data-testid="user-apps-frame" src={src}
        allow="clipboard-read; clipboard-write; fullscreen; microphone; camera" allowFullScreen />
    </div>
  );
}
