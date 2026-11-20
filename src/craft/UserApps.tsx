/**
 * ▦ → আমার অ্যাপ (decisions.md 81, 82): the user's own web apps, added as .zip files. They run on a separate
 * address (apps.mahbuburrahman.bd), shown here in a frame, so no app can read ProNotes' drafts, settings
 * or keys. ProNotes sends each app page its keyboard layout and typing rules (the bridge there types Bangla
 * in the app's text boxes), switches the language when an app page asks (Ctrl+Space there), and, when its
 * on-screen keyboard is on, shows that keyboard under the app while one of the app's text boxes has focus.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BridgeConfig, FromApp, ToApp } from '../../apps-site/protocol';
import type { BornonaConfig } from '../editor';
import { OnScreenKeyboard, type RemoteTarget } from '../app/OnScreenKeyboard';
import { useT } from '../i18n';

/** Where the apps site is: the real one, or the local test copy (npm run preview:apps). */
export function appsOrigin(loc: { hostname: string } = location): string {
  return loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' ? 'http://localhost:4174' : 'https://apps.mahbuburrahman.bd';
}

interface Props {
  cfg: BridgeConfig;
  onToggleLanguage: () => void;
  /** ProNotes' on-screen keyboard (the same setting as for drafts). */
  keyboard?: { on: boolean; compact: boolean; getConfig: () => BornonaConfig };
}

export function UserApps({ cfg, onToggleLanguage, keyboard }: Props) {
  const { t, lang } = useT();
  const origin = appsOrigin();
  // every app page that said hello (an app can have several frames or pages)
  const pages = useRef(new Set<MessageEventSource>());
  // the page whose text box has focus, and the text before its caret
  const active = useRef<MessageEventSource | null>(null);
  const before = useRef('');
  const [editing, setEditing] = useState(false);
  const [kbDown, setKbDown] = useState(false);
  const cfgNow = useRef(cfg);
  cfgNow.current = cfg;
  const toggle = useRef(onToggleLanguage);
  toggle.current = onToggleLanguage;
  const post = (w: MessageEventSource | null, m: ToApp) => { try { (w as Window | null)?.postMessage(m, origin); } catch { /* the page is gone */ } };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || !e.source) return;
      const d = e.data as FromApp | null;
      if (d?.pn === 'hello') {
        pages.current.add(e.source);
        post(e.source, { pn: 'cfg', cfg: cfgNow.current });
      } else if (d?.pn === 'toggle') toggle.current();
      else if (d?.pn === 'ctx') {
        if (d.editable) { active.current = e.source; before.current = String(d.before ?? ''); setEditing(true); setKbDown(false); }
        else if (e.source === active.current) { before.current = String(d.before ?? ''); setEditing(false); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new layout or language: to every app page at once
  useEffect(() => {
    for (const w of [...pages.current]) {
      try { (w as Window).postMessage({ pn: 'cfg', cfg } satisfies ToApp, origin); } catch { pages.current.delete(w); }
    }
  }, [cfg, origin]);

  const showKb = !!keyboard?.on && editing && !kbDown;
  // the device's own keyboard stays down while ProNotes' is up (and comes back when it is put away)
  useEffect(() => { post(active.current, { pn: 'osk', on: showKb }); }, [showKb]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo<RemoteTarget>(() => ({
    type: (text) => post(active.current, { pn: 'type', text }),
    back: () => post(active.current, { pn: 'back' }),
    enter: () => post(active.current, { pn: 'enter' }),
    tab: () => post(active.current, { pn: 'tab' }),
    before: () => before.current,
    move: (dx, dy, select) => post(active.current, { pn: 'move', dx, dy, select }),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const src = `${origin}/?host=${encodeURIComponent(location.origin)}&lang=${lang}`;
  return (
    <div className="user-apps-wrap">
      <div className="craft-stage user-apps">
        <iframe className="craft-frame" title={t('আমার অ্যাপ')} data-testid="user-apps-frame" src={src}
          allow="clipboard-read; clipboard-write; fullscreen; microphone; camera" allowFullScreen />
      </div>
      {showKb && keyboard && (
        <footer className="dock user-apps-dock" data-testid="user-apps-kb">
          <OnScreenKeyboard editor={null} target={target} compact={keyboard.compact} map={cfg.map} bangla={cfg.bangla}
            getConfig={keyboard.getConfig} onToggleLanguage={onToggleLanguage} onWordDone={() => {}} flash={null} onHide={() => setKbDown(true)} />
        </footer>
      )}
    </div>
  );
}
