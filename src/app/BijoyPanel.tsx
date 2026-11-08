import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { bijoyRuns, bijoyFromHtml, runsToClipboardHtml, toUnicode, PASTE_MSG_HTML, type Run } from '../bijoy';
import { insertPlainText, docToBijoy, docToUnicode, mapDocText, selectedOrAll } from '../editor';
import { amountInWords, toBnDigits, toEnDigits, fixBrokenBangla, countText } from '../convert';
import { useT } from '../i18n';
import { PanelControls } from './ui';

type Tab = 'bijoy' | 'amount' | 'digits' | 'fix' | 'count';
const TABS: { id: Tab; label: string }[] = [
  { id: 'bijoy', label: 'ইউনিকোড ⇄ বিজয়' },
  { id: 'amount', label: 'টাকা কথায়' },
  { id: 'digits', label: 'সংখ্যা' },
  { id: 'fix', label: 'ভাঙা লেখা ঠিক' },
  { id: 'count', label: 'শব্দ গণনা' },
];

interface Props {
  editor: Editor;
  /** Bijoy font for the preview and for Word ('' = show the raw ANSI letters). */
  ansiFont: string;
  enFont: string;
  say: (m: string, vars?: Record<string, string | number>) => void;
  onClose?: () => void;
}

/**
 * Converter: Unicode ⇄ Bijoy (ported from v8, plus whole-draft conversion), amount in words,
 * Bangla ⇄ English digits, broken-text repair and word count.
 */
export function BijoyPanel(p: Props) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('bijoy');
  const [min, setMin] = useState(false);
  return (
    <section className={'conv' + (min ? ' min' : '')} aria-label="Converter" data-testid="bijoy-panel">
      <div className="conv-head">
        <h2 className="conv-title">Converter</h2>
        <div className="conv-tabs" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-testid={'conv-' + x.id}
              onPointerDown={(e) => e.preventDefault()} onClick={() => setTab(x.id)}>{t(x.label)}</button>
          ))}
        </div>
        {p.onClose && <PanelControls min={min} setMin={setMin} onClose={p.onClose} testid="conv" />}
      </div>
      {!min && tab === 'bijoy' && <BijoyTab {...p} />}
      {!min && tab === 'amount' && <AmountTab {...p} />}
      {!min && tab === 'digits' && <DigitsTab {...p} />}
      {!min && tab === 'fix' && <FixTab {...p} />}
      {!min && tab === 'count' && <CountTab {...p} />}
    </section>
  );
}

function BijoyTab({ editor, ansiFont, enFont, say }: Props) {
  const { t } = useT();
  const [runs, setRuns] = useState<Run[]>([]);
  const [input, setInput] = useState('');
  const out = useRef<HTMLDivElement>(null);
  const wordFont = ansiFont || 'SutonnyMJ';

  const toBijoy = () => {
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const src = empty ? state.doc.textBetween(0, state.doc.content.size, '\n', ' ') : state.doc.textBetween(from, to, '\n', ' ');
    if (!src.trim()) return say('বদলানোর মতো লেখা নেই');
    const r = bijoyRuns(src);
    setRuns(r);
    const plain = r.map((x) => x.text).join('');
    const html = runsToClipboardHtml(r, wordFont, enFont);
    const ok = () =>
      say(empty ? 'পুরো লেখা বিজয়ে কপি হয়েছে। Word-এ পেস্ট করলে বাংলা {bf}, ইংরেজি {ef} ফন্টে বসবে।' : 'সিলেক্ট করা অংশ বিজয়ে কপি হয়েছে। Word-এ পেস্ট করলে বাংলা {bf}, ইংরেজি {ef} ফন্টে বসবে।', { bf: wordFont, ef: enFont });
    const selectPreview = () =>
      requestAnimationFrame(() => {
        if (!out.current) return;
        const range = document.createRange();
        range.selectNodeContents(out.current);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        say('লেখা সিলেক্ট করা আছে, এখন Copy করুন');
      });
    const plainOnly = () =>
      navigator.clipboard.writeText(plain).then(() => say('বিজয়ে কপি হয়েছে (ফন্ট ছাড়া)। Word-এ বাংলা অংশে SutonnyMJ দিন।'), selectPreview);
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        navigator.clipboard
          .write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
          .then(ok, () => plainOnly().catch(selectPreview));
      } else if (navigator.clipboard) plainOnly().catch(selectPreview);
      else selectPreview();
    } catch {
      selectPreview();
    }
  };

  const insert = (u: string) => {
    editor.commands.focus();
    const before = editor.state.selection.$from.parent.textBetween(0, editor.state.selection.$from.parentOffset);
    insertPlainText(editor.view, (before && !/\s$/.test(before) ? ' ' : '') + u);
  };
  const toUni = () => {
    if (!input.trim()) return say('আগে বিজয় লেখা পেস্ট করুন');
    insert(toUnicode(input));
    setInput('');
    say('ইউনিকোডে বদলে বসানো হয়েছে');
  };

  const fonts = { bijoyFont: wordFont, englishFont: enFont || 'Times New Roman' };
  const wholeToBijoy = () => {
    const n = docToBijoy(editor.view, fonts);
    say(n ? 'পুরো ড্রাফট বিজয়-এ ({bf}) বদলানো হলো। ফেরাতে Undo বা “পুরো ড্রাফট ইউনিকোডে”।' : 'বদলানোর মতো ইউনিকোড বাংলা নেই', { bf: wordFont });
  };
  const wholeToUnicode = () => {
    const n = docToUnicode(editor.view, fonts);
    say(n ? 'বিজয় অংশ ইউনিকোডে বদলানো হলো' : 'ড্রাফটে বিজয় ফন্টের লেখা নেই');
  };

  return (
    <div className="conv-body two">
      <div>
        <h3>{t('ইউনিকোড → বিজয় (ANSI)')}</h3>
        <p className="note">{t('পুরো লেখা, বা সিলেক্ট করা অংশ, বিজয়ে বদলে কপি হবে। Word-এ পেস্ট করলে বাংলা অংশ {bf} আর ইংরেজি অংশ {ef} ফন্টে নিজে থেকে বসবে।', { bf: wordFont, ef: enFont })}</p>
        <div ref={out} className={'bjprev' + (ansiFont ? ' ansi' : '')} tabIndex={0} data-testid="bijoy-out" data-ph={t('বিজয় লেখা এখানে দেখাবে')}
          style={ansiFont ? ({ ['--f-ansi' as string]: `"${ansiFont}"` } as React.CSSProperties) : undefined}>
          {runs.map((r, i) => <span key={i} className={r.en ? 'en' : 'bn'}>{r.text}</span>)}
        </div>
        <button type="button" className="btn primary" data-testid="to-bijoy" onPointerDown={(e) => e.preventDefault()} onClick={toBijoy}>{t('বিজয়ে বদলে কপি করুন')}</button>
      </div>
      <div>
        <h3>{t('বিজয় → ইউনিকোড')}</h3>
        <p className="note">{t('Word থেকে কপি করে এখানে বা সরাসরি লেখার পাতায় পেস্ট করুন। শুধু SutonnyMJ ফন্টের অংশ বদলাবে, ইংরেজি অংশ যেমন আছে থাকবে। ফন্টের তথ্য ছাড়া সাদা লেখা হলে সবটাই বিজয় ধরে বদলাবে।')}</p>
        <textarea data-testid="bijoy-in" spellCheck={false} placeholder="Avgvi †mvbvi evsjv" value={input} onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const u = bijoyFromHtml(e.clipboardData.getData('text/html'));
            if (u === null) return;
            e.preventDefault();
            insert(u);
            say(PASTE_MSG_HTML);
          }} />
        <button type="button" className="btn primary" data-testid="to-unicode" onClick={toUni}>{t('ইউনিকোডে বদলে বসান')}</button>
      </div>
      <div className="wide">
        <h3>{t('পুরো ড্রাফট')}</h3>
        <p className="note">{t('ড্রাফটের লেখাই বদলে যায় (ফরম্যাট থাকে)। বিজয়ে রাখা লেখায় খোঁজা, পরামর্শ ও বানান কাজ করে না; কাজ শেষে ইউনিকোডে ফেরানো ভালো।')}</p>
        <div className="row">
          <button type="button" className="btn" data-testid="doc-to-bijoy" onPointerDown={(e) => e.preventDefault()} onClick={wholeToBijoy}>{t('পুরো ড্রাফট বিজয়ে')}</button>
          <button type="button" className="btn" data-testid="doc-to-unicode" onPointerDown={(e) => e.preventDefault()} onClick={wholeToUnicode}>{t('পুরো ড্রাফট ইউনিকোডে')}</button>
        </div>
      </div>
    </div>
  );
}

/** Insert at the caret with a space before when needed. */
function insertAt(editor: Editor, u: string) {
  editor.commands.focus();
  const before = editor.state.selection.$from.parent.textBetween(0, editor.state.selection.$from.parentOffset);
  insertPlainText(editor.view, (before && !/\s$/.test(before) ? ' ' : '') + u);
}
const copyText = (s: string, say: Props['say']) =>
  navigator.clipboard?.writeText(s).then(() => say('কপি হয়েছে'), () => say('কপি করা গেল না; লেখাটা সিলেক্ট করে কপি করুন'))
  ?? say('কপি করা গেল না; লেখাটা সিলেক্ট করে কপি করুন');

function AmountTab({ editor, say }: Props) {
  const { t } = useT();
  const [v, setV] = useState('');
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const r = v.trim() ? amountInWords(v, lang) : null;
  const rows = r ? [r.deedStyle, r.withTaka, r.words] : [];
  return (
    <div className="conv-body">
      <p className="note">{t('অঙ্কে টাকার পরিমাণ লিখুন (যেমন 500000, ৫,০০,০০০ বা 1250.50)। কোটি-লক্ষ-হাজার হিসাবে কথায় হবে।')}</p>
      <div className="row">
        <input data-testid="amount-in" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="৫,০০,০০০" />
        <div className="seg small" role="group">
          <button type="button" aria-pressed={lang === 'bn'} data-testid="amount-bn" onClick={() => setLang('bn')}>বাংলা</button>
          <button type="button" aria-pressed={lang === 'en'} data-testid="amount-en" onClick={() => setLang('en')}>English</button>
        </div>
      </div>
      {v.trim() && !r && <p className="note warn" data-testid="amount-err">{t('শুধু অঙ্ক দিন; পয়সা থাকলে দশমিকের পরে দুই ঘর')}</p>}
      <ul className="conv-out" data-testid="amount-out">
        {rows.map((x, i) => (
          <li key={i}>
            <span data-testid={'amount-row-' + i}>{x}</span>
            <button type="button" className="btn small" data-testid={'amount-insert-' + i} onPointerDown={(e) => e.preventDefault()} onClick={() => { insertAt(editor, x); say('বসানো হয়েছে'); }}>{t('বসান')}</button>
            <button type="button" className="btn small" onClick={() => copyText(x, say)}>{t('কপি')}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DigitsTab({ editor, say }: Props) {
  const { t } = useT();
  const apply = (fn: (s: string) => string) => {
    const sel = !editor.state.selection.empty;
    const n = mapDocText(editor.view, fn, true);
    say(n ? (sel ? 'সিলেক্ট করা অংশের সংখ্যা বদলানো হলো' : 'পুরো ড্রাফটের সংখ্যা বদলানো হলো') : 'বদলানোর মতো সংখ্যা নেই');
  };
  return (
    <div className="conv-body">
      <p className="note">{t('কিছু সিলেক্ট করা থাকলে শুধু সেই অংশ, না থাকলে পুরো ড্রাফট। Undo দিয়ে ফেরানো যায়।')}</p>
      <div className="row">
        <button type="button" className="btn" data-testid="digits-bn" onPointerDown={(e) => e.preventDefault()} onClick={() => apply(toBnDigits)}>123 → ১২৩</button>
        <button type="button" className="btn" data-testid="digits-en" onPointerDown={(e) => e.preventDefault()} onClick={() => apply(toEnDigits)}>১২৩ → 123</button>
      </div>
    </div>
  );
}

function FixTab({ editor, say }: Props) {
  const { t } = useT();
  const [pipe, setPipe] = useState(true);
  const [done, setDone] = useState<string[] | null>(null);
  const run = () => {
    const changes = new Set<string>();
    // the broken-text fix runs per paragraph so a vowel sign is never moved across paragraphs
    const n = mapDocText(editor.view, (s) => {
      const r = fixBrokenBangla(s, { pipeAsDari: pipe });
      r.changes.forEach((c) => changes.add(c));
      return r.text;
    }, true);
    setDone([...changes]);
    say(n ? 'লেখা ঠিক করা হলো; Undo দিয়ে ফেরানো যায়' : 'ঠিক করার মতো কিছু পাওয়া গেল না');
  };
  return (
    <div className="conv-body">
      <p className="note">{t('PDF বা পুরোনো সফটওয়্যার থেকে আসা ভাঙা বাংলা: কার আগে বসে যাওয়া (েক → কে), অা → আ, ভাঙা য়/ড়/ঢ়, অদৃশ্য স্পেস, বাড়তি স্পেস। সিলেক্ট করা অংশ, না থাকলে পুরো ড্রাফট।')}</p>
      <label><input type="checkbox" data-testid="fix-pipe" checked={pipe} onChange={(e) => setPipe(e.target.checked)} /> {t('বাংলার পরে | থাকলে দাঁড়ি (।) করো')}</label>
      <div className="row"><button type="button" className="btn primary" data-testid="fix-run" onPointerDown={(e) => e.preventDefault()} onClick={run}>{t('ঠিক করুন')}</button></div>
      {done && (
        <ul className="conv-out" data-testid="fix-changes">
          {done.length ? done.map((c) => <li key={c}>✓ {t(c)}</li>) : <li>{t('কোনো বদল দরকার হয়নি')}</li>}
        </ul>
      )}
    </div>
  );
}

function CountTab({ editor }: Props) {
  const { t } = useT();
  const n = (v: number) => t('{n}', { n: v });
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    editor.on('selectionUpdate', f);
    editor.on('update', f);
    return () => { editor.off('selectionUpdate', f); editor.off('update', f); };
  }, [editor]);
  const { text, whole } = selectedOrAll(editor.view);
  const c = countText(text);
  return (
    <div className="conv-body">
      <p className="note">{whole ? t('পুরো ড্রাফট') : t('সিলেক্ট করা অংশ')}</p>
      <table className="wc" data-testid="conv-count">
        <tbody>
          <tr><td>{t('শব্দ')}</td><td data-testid="cc-words">{n(c.words)}</td></tr>
          <tr><td>{t('অক্ষর (স্পেসসহ)')}</td><td>{n(c.chars)}</td></tr>
          <tr><td>{t('অক্ষর (স্পেস ছাড়া)')}</td><td>{n(c.charsNoSpace)}</td></tr>
          <tr><td>{t('অনুচ্ছেদ')}</td><td>{n(c.paragraphs)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
