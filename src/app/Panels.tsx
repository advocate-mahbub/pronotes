/** Font and Paragraph detail panels (Word's dialogs), Find & Replace bar, word count. */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { getFind, type BornonaConfig, type LineRule, type UnderlineStyle } from '../editor';
import { useT } from '../i18n';
import { Sheet } from './ui';
import { attachBornona } from './bornona-input';

const TW_PER_CM = 1440 / 2.54;
const cm = (tw: number | null | undefined) => (tw == null ? '' : String(Math.round((tw / TW_PER_CM) * 100) / 100));
const tw = (cmStr: string) => (cmStr.trim() === '' ? null : Math.round(parseFloat(cmStr) * TW_PER_CM));
const n = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

export const SCALES = [200, 150, 100, 90, 80, 66, 50, 33];

/** Word's Font dialog, Advanced tab (Scale, Spacing, Position, Kerning) plus underline style and small caps. */
export function FontPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useT();
  const a = editor.getAttributes('textStyle');
  const u = editor.getAttributes('underline');
  const [scale, setScale] = useState(String(a.scale ?? 100));
  const sp = (a.spacing as number | null) ?? 0;
  const [spType, setSpType] = useState<'normal' | 'expanded' | 'condensed'>(sp > 0 ? 'expanded' : sp < 0 ? 'condensed' : 'normal');
  const [spBy, setSpBy] = useState(String(Math.abs(sp) || 1));
  const pos = (a.position as number | null) ?? 0;
  const [posType, setPosType] = useState<'normal' | 'raised' | 'lowered'>(pos > 0 ? 'raised' : pos < 0 ? 'lowered' : 'normal');
  const [posBy, setPosBy] = useState(String(Math.abs(pos) || 3));
  const [kernOn, setKernOn] = useState(a.kern != null);
  const [kernAt, setKernAt] = useState(String(a.kern ?? 12));
  const [ustyle, setUstyle] = useState<UnderlineStyle | 'none'>(editor.isActive('underline') ? ((u.ustyle as UnderlineStyle) || 'single') : 'none');
  const [smallCaps, setSmallCaps] = useState(Boolean(a.smallCaps));

  const apply = () => {
    const s = Math.min(600, Math.max(1, Number(scale) || 100));
    const spacing = spType === 'normal' ? null : (spType === 'expanded' ? 1 : -1) * (Number(spBy) || 0);
    const position = posType === 'normal' ? null : (posType === 'raised' ? 1 : -1) * (Number(posBy) || 0);
    let c = editor.chain().focus().setCharFormat({ scale: s === 100 ? null : s, spacing, position, kern: kernOn ? Number(kernAt) || 12 : null, smallCaps });
    c = ustyle === 'none' ? c.unsetUnderline() : c.setUnderline().setUnderlineStyle(ustyle);
    c.run();
    onClose();
  };

  return (
    <Sheet title={t('ফন্টের বিস্তারিত')} onClose={onClose} testid="font-sheet"
      footer={<><button type="button" className="btn primary" data-testid="font-apply" onClick={apply}>{t('প্রয়োগ করুন')}</button><button type="button" className="btn" onClick={onClose}>{t('বাতিল')}</button></>}>
      <h3>{t('অক্ষরের ফাঁক (Character Spacing)')}</h3>
      <div className="form">
        <label>Scale (%)
          <input list="pn-scales" inputMode="decimal" data-testid="f-scale" value={scale} onChange={(e) => setScale(e.target.value)} />
          <datalist id="pn-scales">{SCALES.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>Spacing
          <select data-testid="f-sptype" value={spType} onChange={(e) => setSpType(e.target.value as typeof spType)}>
            <option value="normal">{t('স্বাভাবিক')}</option><option value="expanded">{t('বাড়ানো (Expanded)')}</option><option value="condensed">{t('কমানো (Condensed)')}</option>
          </select>
        </label>
        <label>{t('কতটা (pt)')}<input inputMode="decimal" data-testid="f-spby" disabled={spType === 'normal'} value={spBy} onChange={(e) => setSpBy(e.target.value)} /></label>
        <label>Position
          <select data-testid="f-postype" value={posType} onChange={(e) => setPosType(e.target.value as typeof posType)}>
            <option value="normal">{t('স্বাভাবিক')}</option><option value="raised">{t('উপরে (Raised)')}</option><option value="lowered">{t('নিচে (Lowered)')}</option>
          </select>
        </label>
        <label>{t('কতটা (pt)')}<input inputMode="decimal" data-testid="f-posby" disabled={posType === 'normal'} value={posBy} onChange={(e) => setPosBy(e.target.value)} /></label>
        <label className="check"><input type="checkbox" data-testid="f-kern" checked={kernOn} onChange={(e) => setKernOn(e.target.checked)} /> {t('Kerning, এই সাইজ ও বড় ফন্টে (pt):')}
          <input inputMode="decimal" className="mini-in" disabled={!kernOn} value={kernAt} onChange={(e) => setKernAt(e.target.value)} /></label>
      </div>
      <p className="note">{t('Scale Word ফাইলে হুবহু যায়; পর্দায় আনুমানিক দেখায়। Kerning শুধু সেই ফন্টে কাজ করে যার ভেতরে kerning-এর তথ্য আছে।')}</p>
      <h3>{t('অন্যান্য')}</h3>
      <div className="form">
        <label>{t('নিচে দাগের ধরন')}
          <select data-testid="f-ustyle" value={ustyle} onChange={(e) => setUstyle(e.target.value as typeof ustyle)}>
            <option value="none">{t('নেই')}</option><option value="single">{t('একক')}</option><option value="double">{t('জোড়া')}</option><option value="dotted">{t('ফোঁটা')}</option><option value="wavy">{t('ঢেউ')}</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" data-testid="f-smallcaps" checked={smallCaps} onChange={(e) => setSmallCaps(e.target.checked)} /> Small caps ({t('শুধু ইংরেজি')})</label>
      </div>
      <div className="preview" style={{ letterSpacing: spType === 'normal' ? undefined : (spType === 'expanded' ? 1 : -1) * (Number(spBy) || 0) + 'pt', fontVariantCaps: smallCaps ? 'small-caps' : undefined }}>
        <span style={{ display: 'inline-block', transform: `scaleX(${(Number(scale) || 100) / 100})`, transformOrigin: '0 50%' }}>আমার সোনার বাংলা · Plaintiff</span>
      </div>
    </Sheet>
  );
}

/** Word's Paragraph dialog: alignment, indents, spacing, line spacing, pagination options. */
export function ParagraphPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useT();
  const a = editor.state.selection.$from.parent.attrs;
  const [align, setAlign] = useState<string>((a.textAlign as string) || '');
  const [indL, setIndL] = useState(cm(a.indL));
  const [indR, setIndR] = useState(cm(a.indR));
  const first = a.first as number | null;
  const [special, setSpecial] = useState<'none' | 'first' | 'hanging'>(first == null || first === 0 ? 'none' : first > 0 ? 'first' : 'hanging');
  const [by, setBy] = useState(first ? cm(Math.abs(first)) : '1.27');
  const [before, setBefore] = useState(a.spBefore == null ? '' : String(a.spBefore));
  const [after, setAfter] = useState(a.spAfter == null ? '' : String(a.spAfter));
  type LineChoice = 'default' | 'single' | '1.5' | 'double' | 'atLeast' | 'exact' | 'multiple';
  const initLine: LineChoice =
    a.lineRule == null ? 'default' : a.lineRule === 'atLeast' ? 'atLeast' : a.lineRule === 'exact' ? 'exact' : a.lineVal === 1 ? 'single' : a.lineVal === 1.5 ? '1.5' : a.lineVal === 2 ? 'double' : 'multiple';
  const [line, setLine] = useState<LineChoice>(initLine);
  const [lineAt, setLineAt] = useState(a.lineVal == null ? '' : String(a.lineVal));
  const [keepNext, setKeepNext] = useState(Boolean(a.keepNext));
  const [keepLines, setKeepLines] = useState(Boolean(a.keepLines));
  const [breakBefore, setBreakBefore] = useState(Boolean(a.breakBefore));
  const [widow, setWidow] = useState(a.widow !== false);

  const apply = () => {
    let lineRule: LineRule | null = null;
    let lineVal: number | null = null;
    if (line === 'single') [lineRule, lineVal] = ['auto', 1];
    else if (line === '1.5') [lineRule, lineVal] = ['auto', 1.5];
    else if (line === 'double') [lineRule, lineVal] = ['auto', 2];
    else if (line === 'multiple') [lineRule, lineVal] = ['auto', n(lineAt) ?? 1.15];
    else if (line === 'atLeast' || line === 'exact') [lineRule, lineVal] = [line, n(lineAt) ?? 12];
    const f = tw(by) ?? 0;
    let c = editor.chain().focus().setParagraphFormat({
      indL: tw(indL), indR: tw(indR), first: special === 'none' ? null : special === 'first' ? f : -f,
      spBefore: n(before), spAfter: n(after), lineRule, lineVal, keepNext, keepLines, breakBefore, widow,
    });
    c = align ? c.setTextAlign(align) : c.unsetTextAlign();
    c.run();
    onClose();
  };
  const needsAt = line === 'atLeast' || line === 'exact' || line === 'multiple';

  return (
    <Sheet title={t('অনুচ্ছেদের বিস্তারিত')} onClose={onClose} testid="para-sheet"
      footer={<><button type="button" className="btn primary" data-testid="para-apply" onClick={apply}>{t('প্রয়োগ করুন')}</button><button type="button" className="btn" onClick={onClose}>{t('বাতিল')}</button></>}>
      <div className="form">
        <label>{t('সারিবদ্ধতা')}
          <select data-testid="p-align" value={align} onChange={(e) => setAlign(e.target.value)}>
            <option value="">{t('স্টাইল অনুযায়ী')}</option><option value="left">{t('বামে')}</option><option value="center">{t('মাঝে')}</option><option value="right">{t('ডানে')}</option><option value="justify">{t('দুই পাশ সমান')}</option>
          </select>
        </label>
      </div>
      <h3>Indent ({t('সেমি')})</h3>
      <div className="form">
        <label>{t('বামে')}<input inputMode="decimal" data-testid="p-indl" value={indL} placeholder="0" onChange={(e) => setIndL(e.target.value)} /></label>
        <label>{t('ডানে')}<input inputMode="decimal" data-testid="p-indr" value={indR} placeholder="0" onChange={(e) => setIndR(e.target.value)} /></label>
        <label>{t('বিশেষ')}
          <select data-testid="p-special" value={special} onChange={(e) => setSpecial(e.target.value as typeof special)}>
            <option value="none">{t('নেই')}</option><option value="first">{t('প্রথম লাইন')}</option><option value="hanging">{t('ঝুলন্ত (Hanging)')}</option>
          </select>
        </label>
        <label>{t('কতটা')}<input inputMode="decimal" data-testid="p-by" disabled={special === 'none'} value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
      <h3>{t('ফাঁক')}</h3>
      <div className="form">
        <label>{t('আগে (pt)')}<input inputMode="decimal" data-testid="p-before" value={before} placeholder={t('ডিফল্ট')} onChange={(e) => setBefore(e.target.value)} /></label>
        <label>{t('পরে (pt)')}<input inputMode="decimal" data-testid="p-after" value={after} placeholder={t('ডিফল্ট')} onChange={(e) => setAfter(e.target.value)} /></label>
        <label>{t('লাইনের ফাঁক')}
          <select data-testid="p-line" value={line} onChange={(e) => setLine(e.target.value as LineChoice)}>
            <option value="default">{t('ডিফল্ট (স্টাইল অনুযায়ী)')}</option>
            <option value="single">{t('একক')}</option><option value="1.5">1.5</option><option value="double">{t('দ্বিগুণ')}</option>
            <option value="atLeast">{t('অন্তত (At least)')}</option><option value="exact">{t('ঠিক এতটা (Exactly)')}</option><option value="multiple">{t('গুণিতক (Multiple)')}</option>
          </select>
        </label>
        <label>{line === 'multiple' ? t('কত গুণ') : t('কত (pt)')}<input inputMode="decimal" data-testid="p-lineat" disabled={!needsAt} value={lineAt} onChange={(e) => setLineAt(e.target.value)} /></label>
      </div>
      <h3>{t('পাতা ভাঙা')}</h3>
      <div className="form checks">
        <label className="check"><input type="checkbox" data-testid="p-keepnext" checked={keepNext} onChange={(e) => setKeepNext(e.target.checked)} /> {t('পরের অনুচ্ছেদের সাথে একই পাতায় রাখুন')}</label>
        <label className="check"><input type="checkbox" data-testid="p-keeplines" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} /> {t('অনুচ্ছেদের লাইনগুলো একসাথে রাখুন')}</label>
        <label className="check"><input type="checkbox" data-testid="p-breakbefore" checked={breakBefore} onChange={(e) => setBreakBefore(e.target.checked)} /> {t('অনুচ্ছেদের আগে নতুন পাতা')}</label>
        <label className="check"><input type="checkbox" data-testid="p-widow" checked={widow} onChange={(e) => setWidow(e.target.checked)} /> {t('পাতার শেষে একা লাইন ঠেকান (Widow/Orphan)')}</label>
      </div>
      <p className="note">{t('পাতা ভাঙার অপশনগুলো Word ফাইলে কাজ করে; পর্দায় পাতা ভাগ আসবে পরের ধাপে।')}</p>
    </Sheet>
  );
}

/** Find & Replace bar (Ctrl+F / Ctrl+H). The boxes type through the Bornona engine. */
export function FindBar({ editor, showReplace, onClose, getConfig, onToggleLanguage }: {
  editor: Editor; showReplace: boolean; onClose: () => void; getConfig: () => BornonaConfig; onToggleLanguage: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [cs, setCs] = useState(false);
  const [replace, setReplace] = useState(showReplace);
  const [, force] = useState(0);
  const qRef = useRef<HTMLInputElement>(null);
  const rRef = useRef<HTMLInputElement>(null);
  useEffect(() => setReplace((v) => v || showReplace), [showReplace]);
  useEffect(() => {
    qRef.current?.focus();
    const offs = [qRef.current, rRef.current].filter(Boolean).map((el) => attachBornona(el!, getConfig, onToggleLanguage));
    return () => offs.forEach((f) => f());
  }, [getConfig, onToggleLanguage, replace]);
  useEffect(() => {
    editor.commands.setFindQuery(q, cs);
  }, [editor, q, cs]);
  useEffect(() => {
    const up = () => force((x) => x + 1);
    editor.on('transaction', up);
    return () => {
      editor.off('transaction', up);
      editor.commands.clearFind();
    };
  }, [editor]);
  const s = getFind(editor.state);
  const count = s.matches.length;
  const label = count ? t('{i}/{n}টা', { i: s.index + 1, n: count }) : q ? t('পাওয়া যায়নি') : '';
  const next = () => editor.commands.findNext();
  return (
    <div className="findbar" role="search" data-testid="findbar">
      <input ref={qRef} data-testid="find-q" placeholder={t('খুঁজুন')} value={q} spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) editor.commands.findPrev(); else next(); }
          if (e.key === 'Escape') onClose();
        }} />
      <span className="count" data-testid="find-count">{label}</span>
      <button type="button" className="tb" title={t('আগেরটা')} aria-label={t('আগেরটা')} onClick={() => editor.commands.findPrev()}>↑</button>
      <button type="button" className="tb" title={t('পরেরটা')} aria-label={t('পরেরটা')} data-testid="find-next" onClick={next}>↓</button>
      <button type="button" className={'tb' + (cs ? ' on' : '')} title={t('বড়-ছোট হাতের অক্ষর মিলিয়ে (ইংরেজি)')} aria-pressed={cs} onClick={() => setCs((v) => !v)}>Aa</button>
      {replace ? (
        <>
          <input ref={rRef} data-testid="replace-q" placeholder={t('এটা দিয়ে বদলান')} value={r} spellCheck={false}
            onChange={(e) => setR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
          <button type="button" className="btn small" data-testid="replace-one" disabled={!count} onClick={() => { editor.commands.replaceCurrent(r); }}>{t('বদলান')}</button>
          <button type="button" className="btn small" data-testid="replace-all" disabled={!count} onClick={() => { editor.commands.replaceAll(r); }}>{t('সব বদলান')}</button>
        </>
      ) : (
        <button type="button" className="btn small" data-testid="show-replace" onClick={() => setReplace(true)}>{t('বদলান…')}</button>
      )}
      <button type="button" className="tb" title={t('বন্ধ')} aria-label={t('বন্ধ')} data-testid="find-close" onClick={onClose}>✕</button>
    </div>
  );
}

/** Word count for the whole document (or the selection). */
export function WordCount({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useT();
  const { from, to, empty } = editor.state.selection;
  const text = empty ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ') : editor.state.doc.textBetween(from, to, '\n', ' ');
  const words = (text.match(/[^\s।,;:?!()"“”'‘’]+/g) || []).length;
  const chars = [...text.replace(/\n/g, '')].length;
  const noSpace = [...text.replace(/\s/g, '')].length;
  let paras = 0;
  editor.state.doc.descendants((nd) => {
    if (nd.isTextblock && nd.textContent.trim()) paras++;
    return !nd.isTextblock;
  });
  const row = (k: string, v: number) => (
    <tr><th>{t(k)}</th><td>{t('{n}', { n: v })}</td></tr>
  );
  return (
    <Sheet title={empty ? t('শব্দ গণনা: পুরো ডকুমেন্ট') : t('শব্দ গণনা: সিলেক্ট করা অংশ')} onClose={onClose} testid="wc-sheet">
      <table className="wc" data-testid="wc-table"><tbody>
        {row('শব্দ', words)}
        {row('অক্ষর (স্পেসসহ)', chars)}
        {row('অক্ষর (স্পেস ছাড়া)', noSpace)}
        {empty && row('অনুচ্ছেদ', paras)}
      </tbody></table>
    </Sheet>
  );
}
