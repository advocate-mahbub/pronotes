/**
 * Font box: two lists, Unicode and Bijoy (ANSI), with search. The list that fits the text comes first
 * (Bijoy while typing in Bijoy or when the caret is in Bijoy text). Every font shows a sample that reads as
 * Bangla: Bijoy fonts get Bijoy-encoded text, so nothing looks broken. Names are always in the app's own
 * font. Choosing a font of the other kind converts the selected text (one undo step).
 */
import { useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { isBijoyFont, toBijoy } from '../bijoy';
import { toBijoyIn, toUnicodeIn } from '../editor';
import { cssFamily, fontMatches } from '../fonts';
import { useT } from '../i18n';
import { Popover } from './ui';

export interface FontItem {
  name: string;
  /** Bijoy (ANSI) encoded font. */
  ansi: boolean;
  /** Usable on this device (installed, built in, or added by the user). */
  available: boolean;
  /** Added by the user in Settings. */
  own: boolean;
}
export interface FontLists {
  uni: FontItem[];
  ansi: FontItem[];
}

const SAMPLE = 'আমার সোনার বাংলা';
const SAMPLE_BIJOY = toBijoy(SAMPLE);
const clean = (f: unknown) => String(f ?? '').replace(/["']/g, '').split(',')[0].trim();

interface Props {
  ed: Editor;
  lists: FontLists;
  /** Document font for Unicode text (the "default" row). */
  defaultFont: string;
  ansiTyping: boolean;
  ansiFont: string;
  enFont: string;
  onToggleAnsi?: () => void;
  say: (m: string, vars?: Record<string, string | number>) => void;
}

export function FontPicker({ ed, lists, defaultFont, ansiTyping, ansiFont, enFont, onToggleAnsi, say }: Props) {
  const { t } = useT();
  const cur = clean(ed.getAttributes('textStyle').fontFamily);
  const inBijoy = isBijoyFont(cur, ansiFont);
  const ansiContext = ansiTyping || inBijoy;
  const [tab, setTab] = useState<'uni' | 'ansi' | null>(null);
  const [q, setQ] = useState('');
  const kind = tab ?? (ansiContext ? 'ansi' : 'uni');
  const shown = useMemo(() => {
    const list = (kind === 'ansi' ? lists.ansi : lists.uni).filter((f) => fontMatches(f.name, q));
    // usable fonts first, the rest after (still listed, so the owner knows the name to install)
    return [...list.filter((f) => f.available), ...list.filter((f) => !f.available)];
  }, [kind, lists, q]);

  const label = cur || (ansiTyping ? ansiFont : defaultFont);

  const choose = (f: FontItem | null, close: () => void) => {
    close();
    setQ('');
    setTab(null);
    const { state } = ed.view;
    const { from, to, empty } = state.selection;
    if (!f) {
      // the document's own (Unicode) font: Bijoy text in the selection comes back to Unicode
      if (!empty) {
        const tr = state.tr;
        const n = toUnicodeIn(tr, state, { bijoyFont: ansiFont, englishFont: enFont }, { from, to });
        // then only the font is taken off (size, colour stay), in the same step so one undo brings all back
        const a = tr.mapping.map(from, -1);
        const b = tr.mapping.map(to, 1);
        const ts = state.schema.marks.textStyle;
        tr.doc.nodesBetween(a, b, (node, pos) => {
          const old = node.isText ? node.marks.find((m) => m.type === ts) : undefined;
          if (!old || !old.attrs.fontFamily) return;
          const s0 = Math.max(a, pos);
          const e0 = Math.min(b, pos + node.nodeSize);
          const attrs = { ...old.attrs, fontFamily: null };
          tr.removeMark(s0, e0, ts);
          if (Object.values(attrs).some((v) => v !== null && v !== false && v !== undefined)) tr.addMark(s0, e0, ts.create(attrs));
        });
        ed.view.dispatch(closeHistory(tr));
        ed.commands.focus();
        if (n) say('বিজয় লেখা ইউনিকোডে ফিরিয়ে ডকুমেন্টের ফন্ট বসানো হলো');
        return;
      }
      if (ansiTyping) onToggleAnsi?.();
      ed.chain().focus().unsetFontFamily().run();
      return;
    }
    if (!f.available) return say('{f} এই ডিভাইসে নেই। Settings → ফন্ট-এ ফাইলটা যোগ করুন।', { f: f.name });
    if (empty) {
      // typing from here: the font kind decides how Bangla is written
      if (f.ansi !== ansiTyping) {
        onToggleAnsi?.();
        say(f.ansi ? 'এখন থেকে বিজয় (ANSI)-তে লেখা হবে, {f} ফন্টে' : 'এখন থেকে ইউনিকোডে লেখা হবে, {f} ফন্টে', { f: f.name });
      }
      ed.chain().focus().setFontFamily(cssFamily(f.name)).run();
      return;
    }
    const tr = state.tr;
    const cfg = { bijoyFont: f.ansi ? f.name : ansiFont, englishFont: enFont };
    const n = f.ansi ? toBijoyIn(tr, state, cfg, { from, to }) : toUnicodeIn(tr, state, cfg, { from, to }, f.name);
    const a = tr.mapping.map(from, -1);
    const b = tr.mapping.map(to, 1);
    const ts = state.schema.marks.textStyle;
    // the chosen font on the rest of the selection: Bijoy text only for a Bijoy font, everything but Bijoy for a Unicode one
    tr.doc.nodesBetween(a, b, (node, pos) => {
      if (!node.isText) return;
      const nf = clean(node.marks.find((m) => m.type === ts)?.attrs.fontFamily);
      const bj = isBijoyFont(nf, cfg.bijoyFont);
      if (f.ansi ? !bj || nf === enFont : bj) return;
      const s = Math.max(a, pos);
      const e = Math.min(b, pos + node.nodeSize);
      const old = node.marks.find((m) => m.type === ts);
      tr.addMark(s, e, ts.create({ ...(old?.attrs ?? {}), fontFamily: cssFamily(f.name) }));
    });
    ed.view.dispatch(closeHistory(tr));
    if (n) say(f.ansi ? 'নির্বাচিত লেখা বিজয়ে বদলে {f} বসানো হলো' : 'নির্বাচিত বিজয় লেখা ইউনিকোডে বদলে {f} বসানো হলো', { f: f.name });
  };

  return (
    <Popover label={<span className="fp-label" title={label}>{label}</span>} title={t('ফন্ট')} testid="font" className="fp-btn">
      {(close) => (
        <div className="menu font-picker" data-testid="font-picker">
          <div className="seg small" role="tablist">
            <button type="button" role="tab" aria-pressed={kind === 'uni'} data-testid="fp-tab-uni" onClick={() => setTab('uni')}>{t('ইউনিকোড')}</button>
            <button type="button" role="tab" aria-pressed={kind === 'ansi'} data-testid="fp-tab-ansi" onClick={() => setTab('ansi')}>{t('বিজয় (ANSI)')}</button>
          </div>
          <input className="fp-search" type="search" data-testid="font-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('ফন্ট খুঁজুন: নাম বা বাংলায় (সুতন্নী, নিকোশ…)')} aria-label={t('ফন্ট খুঁজুন')}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} lang="bn" />
          <div className="fp-list" role="listbox">
            {kind === 'uni' && !q && (
              <button type="button" role="option" aria-selected={!cur} className="fp-row" data-testid="fp-default" onClick={() => choose(null, close)}>
                <span className="fp-name">{defaultFont} <small>({t('ডিফল্ট')})</small></span>
                <span className="fp-sample" style={{ fontFamily: cssFamily(defaultFont) }}>{SAMPLE}</span>
              </button>
            )}
            {shown.map((f) => (
              <button key={f.name} type="button" role="option" aria-selected={f.name === cur} aria-disabled={!f.available}
                className={'fp-row' + (f.available ? '' : ' off')} data-testid={'fp-' + f.name} onClick={() => choose(f, close)}>
                <span className="fp-name">{f.name}{f.own && <small> · {t('আপনার যোগ করা')}</small>}{!f.available && <small> · {t('এই ডিভাইসে নেই')}</small>}</span>
                {f.available && <span className="fp-sample" style={{ fontFamily: cssFamily(f.name) + ', serif' }}>{f.ansi ? SAMPLE_BIJOY : SAMPLE}</span>}
              </button>
            ))}
            {!shown.length && <p className="note">{t('এই নামে কোনো ফন্ট পাওয়া গেল না')}</p>}
          </div>
          {kind === 'ansi' && <p className="note">{t('বিজয় ফন্ট ProNotes-এর সাথে আসে না (লাইসেন্স)। কম্পিউটারে ইনস্টল থাকলে বা Settings → ফন্ট-এ "ANSI" হিসেবে যোগ করলে এখানে চালু দেখাবে।')}</p>}
        </div>
      )}
    </Popover>
  );
}
