/**
 * Word-like ribbon: tabs (Home, Insert, Tools, Table when the caret is in a table) and their tools.
 * Less-used Home tools move into "⋯" when the ribbon is narrow (iPad portrait).
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import type { Mark } from '@tiptap/pm/model';
import { PARAGRAPH_STYLES, FONT_SIZES, stepFontSize, marksShown, type ParagraphStyle } from '../editor';
import type { DocKind } from '../storage';
import { useT } from '../i18n';
import { Popover } from './ui';
import { load, save } from './prefs';
import { MARGIN_PRESETS, PAPERS, normalizePage, type PageSetup, type PaperId } from '../docx-export/page';
import { GRID_CM, type GridPrefs, type ViewPrefs } from './prefs-types';

export type RibbonTab = 'home' | 'insert' | 'page' | 'view' | 'tools' | 'table';

interface Props {
  editor: Editor;
  kind: DocKind;
  /** Font families offered (document default first). */
  fonts: string[];
  /** Document default font and size (pt), shown when the text has no own font/size. */
  defaultFont: string;
  defaultSize: number;
  /** true while typing Bangla (for the date format). */
  bangla: boolean;
  start: ReactNode; // ☰
  end: ReactNode; // share, keyboard
  onFind: (replace: boolean) => void;
  onConverter: () => void;
  converterOpen: boolean;
  onWordCount: () => void;
  onFontPanel: () => void;
  onParagraphPanel: () => void;
  /** Legal drafts: page setup and view. */
  page: PageSetup;
  onPage: (p: PageSetup) => void;
  onPageSheet: () => void;
  view: ViewPrefs;
  setView: (v: ViewPrefs) => void;
  pages: number;
  /** current zoom in percent (for the zoom box) */
  zoomPct: number;
}

const COLORS = ['#000000', '#444444', '#c62828', '#d84315', '#f9a825', '#2e7d32', '#1565c0', '#6a1b9a'];
const HIGHLIGHTS = ['#fff59d', '#c5e1a5', '#b3e5fc', '#f8bbd0', '#ffcc80', '#e0e0e0'];
const SYMBOLS = ['৳', '/-', 'ঃ', '‍্য', '—', '–', '§', '¶', '…', '©', '®', '½', '¼', '¾', '✓', '×'];
const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
const BN = '০১২৩৪৫৬৭৮৯';
const bnD = (s: string) => s.replace(/\d/g, (d) => BN[Number(d)]);

/** Copies character and paragraph formatting, then pastes it on the next selection. */
interface Painter {
  marks: readonly Mark[];
  para: Record<string, unknown>;
}

export function Ribbon(p: Props) {
  const { t } = useT();
  const ed = p.editor;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    ed.on('transaction', rerender);
    return () => {
      ed.off('transaction', rerender);
    };
  }, [ed]);

  const inTable = ed.isActive('table');
  const [tab, setTab] = useState<RibbonTab>('home');
  const [collapsed, setCollapsed] = useState(() => load('ribbonCollapsed', false));
  useEffect(() => save('ribbonCollapsed', collapsed), [collapsed]);
  useEffect(() => {
    if ((!inTable && tab === 'table') || (p.kind !== 'legal' && (tab === 'page' || tab === 'view'))) setTab('home');
  }, [inTable, tab, p.kind]);

  // ----- current values -----
  const ts = ed.getAttributes('textStyle');
  const curFont = String(ts.fontFamily || '').replace(/["']/g, '') || '';
  const curSize = parseFloat(String(ts.fontSize || '')) || p.defaultSize;
  const para = ed.state.selection.$from.parent;
  const align = (para.attrs.textAlign as string | null) || '';
  const lineVal = para.attrs.lineRule === 'auto' ? (para.attrs.lineVal as number) : null;
  const legal = p.kind === 'legal';

  const chain = () => ed.chain().focus();
  const btn = (label: ReactNode, title: string, active: boolean, run: () => void, testid?: string, cls = '') => (
    <button type="button" className={'tb' + (active ? ' on' : '') + (cls ? ' ' + cls : '')} title={title} aria-label={title} aria-pressed={active}
      data-testid={testid} onPointerDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );

  // ----- format painter -----
  const painter = useRef<Painter | null>(null);
  const [painting, setPainting] = useState(false);
  const startPainter = () => {
    const { $from } = ed.state.selection;
    painter.current = { marks: ed.state.storedMarks ?? $from.marks(), para: { ...$from.parent.attrs } };
    setPainting(true);
    const dom = ed.view.dom as HTMLElement;
    const apply = () => {
      setTimeout(() => {
        const pt = painter.current;
        const { from, to, empty } = ed.state.selection;
        if (!pt || empty) return;
        const tr = ed.state.tr;
        tr.removeMark(from, to);
        pt.marks.forEach((m) => tr.addMark(from, to, m));
        const { textAlign, pstyle, ...rest } = pt.para;
        ed.state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            const keep = node.type.name === 'heading' ? { level: node.attrs.level } : {};
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...rest, ...keep, textAlign, ...(node.type.name === 'paragraph' && pstyle ? { pstyle } : {}) });
            return false;
          }
          return true;
        });
        ed.view.dispatch(tr);
        painter.current = null;
        setPainting(false);
        dom.removeEventListener('pointerup', apply);
        dom.removeEventListener('keyup', apply);
      }, 0);
    };
    dom.addEventListener('pointerup', apply);
    dom.addEventListener('keyup', apply);
  };

  const changeCase = (mode: 'upper' | 'lower' | 'title') => {
    const { from, to } = ed.state.selection;
    const tr = ed.state.tr;
    ed.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      const s = Math.max(from, pos);
      const e = Math.min(to, pos + node.nodeSize);
      const txt = node.text!.slice(s - pos, e - pos);
      const out = mode === 'upper' ? txt.toUpperCase() : mode === 'lower' ? txt.toLowerCase() : txt.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
      if (out !== txt) tr.replaceWith(s, e, ed.schema.text(out, node.marks));
      return false;
    });
    ed.view.dispatch(tr);
  };

  const clearFormatting = () =>
    chain()
      .unsetAllMarks()
      .unsetTextAlign()
      .setParagraphFormat({ indL: null, indR: null, first: null, spBefore: null, spAfter: null, lineRule: null, lineVal: null, keepNext: false, keepLines: false, breakBefore: false })
      .run();

  const setSize = (n: number) => {
    if (!n || n < 1 || n > 400) return;
    chain().setFontSize(n + 'pt').run();
  };

  const today = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const s = `${dd}/${mm}/${d.getFullYear()}`;
    return p.bangla ? bnD(s) : s;
  };
  const todayLong = () => {
    try {
      return new Intl.DateTimeFormat(p.bangla ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    } catch {
      return today();
    }
  };

  // ----- style menu -----
  const styleValue = (() => {
    if (ed.isActive('heading', { level: 1 })) return 'h1';
    if (ed.isActive('heading', { level: 2 })) return 'h2';
    if (ed.isActive('heading', { level: 3 })) return 'h3';
    return legal ? String(para.attrs.pstyle || 'normal') : 'p';
  })();
  /** Turn a heading back into a paragraph (keeps a paragraph's own attributes untouched). */
  const toParagraph = () => (ed.isActive('heading') ? chain().setParagraph() : chain());
  const setStyle = (v: string) => {
    if (/^h[123]$/.test(v)) return chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
    if (!legal) return toParagraph().run();
    return toParagraph().setParagraphStyle(v as ParagraphStyle).run();
  };

  const secondary = (
    <>
      {btn('🖌', t('ফরম্যাট কপি (Format Painter): একবার চাপুন, তারপর যে লেখায় বসাতে চান সেটা সিলেক্ট করুন'), painting, startPainter, 'painter')}
      {btn('🔍', t('খুঁজুন (Ctrl+F)'), false, () => p.onFind(false), 'find-open')}
      {btn('⇄', t('খুঁজে বদলান (Ctrl+H)'), false, () => p.onFind(true), 'replace-open')}
      {btn('▣', t('সব সিলেক্ট'), false, () => chain().selectAll().run(), 'select-all')}
      <span className="sep" />
      {btn(<s>ক</s>, t('কাটা দাগ'), ed.isActive('strike'), () => chain().toggleStrike().run(), 'strike')}
      {btn(<>x<sup>2</sup></>, t('ঊর্ধ্বলিপি'), ed.isActive('superscript'), () => chain().toggleSuperscript().run(), 'sup')}
      {btn(<>x<sub>2</sub></>, t('নিম্নলিপি'), ed.isActive('subscript'), () => chain().toggleSubscript().run(), 'sub')}
      <Popover label={<span className="ab-color" style={{ borderColor: (ts.color as string) || 'currentColor' }}>A</span>} title={t('লেখার রং')} testid="color">
        {(close) => (
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} type="button" className="sw" style={{ background: c }} aria-label={c} onClick={() => { chain().setColor(c).run(); close(); }} />
            ))}
            <button type="button" className="btn small" onClick={() => { chain().unsetColor().run(); close(); }}>{t('স্বয়ংক্রিয়')}</button>
          </div>
        )}
      </Popover>
      <Popover label={<span className="ab-hl">H</span>} title={t('Highlight-এর রং')} testid="highlight" active={ed.isActive('highlight')}>
        {(close) => (
          <div className="swatches">
            {HIGHLIGHTS.map((c) => (
              <button key={c} type="button" className="sw" style={{ background: c }} aria-label={c} onClick={() => { chain().setHighlight({ color: c }).run(); close(); }} />
            ))}
            <button type="button" className="btn small" onClick={() => { chain().unsetHighlight().run(); close(); }}>{t('রং নেই')}</button>
          </div>
        )}
      </Popover>
      <Popover label="Aa" title={t('বড়-ছোট হাতের অক্ষর (ইংরেজি)')} testid="case">
        {(close) => (
          <div className="menu">
            <button type="button" onClick={() => { changeCase('upper'); close(); }}>UPPERCASE</button>
            <button type="button" onClick={() => { changeCase('lower'); close(); }}>lowercase</button>
            <button type="button" onClick={() => { changeCase('title'); close(); }}>Title Case</button>
          </div>
        )}
      </Popover>
      {btn('⌫A', t('ফরম্যাট মুছুন'), false, clearFormatting, 'clear-format')}
      <span className="sep" />
      {btn('↥', t('অনুচ্ছেদের আগে ফাঁক (১২ pt) যোগ/বাদ'), para.attrs.spBefore != null, () => chain().setParagraphFormat({ spBefore: para.attrs.spBefore != null ? null : 12 }).run(), 'sp-before')}
      {btn('↧', t('অনুচ্ছেদের পরে ফাঁক (১২ pt) যোগ/বাদ'), para.attrs.spAfter != null, () => chain().setParagraphFormat({ spAfter: para.attrs.spAfter != null ? null : 12 }).run(), 'sp-after')}
      {btn('¶', t('ফরম্যাট চিহ্ন দেখান/লুকান'), marksShown(ed.state), () => chain().toggleFormattingMarks().run(), 'marks')}
      {btn(t('ফন্ট…'), t('ফন্টের বিস্তারিত (Scale, Spacing, Position…)'), false, p.onFontPanel, 'font-panel')}
      {btn(t('অনুচ্ছেদ…'), t('অনুচ্ছেদের বিস্তারিত (Indent, লাইনের ফাঁক…)'), false, p.onParagraphPanel, 'para-panel')}
    </>
  );

  const home = (
    <>
      {btn('↶', t('Undo (Ctrl/⌘+Z)'), false, () => chain().undo().run(), 'undo')}
      {btn('↷', t('Redo (Ctrl/⌘+Y)'), false, () => chain().redo().run(), 'redo')}
      <span className="sep" />
      <select className="sel style" aria-label={t('স্টাইল')} title={t('স্টাইল')} data-testid="pstyle" value={styleValue} onChange={(e) => setStyle(e.target.value)}>
        {legal
          ? PARAGRAPH_STYLES.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)
          : [['p', 'সাধারণ লেখা'], ['h1', 'শিরোনাম ১'], ['h2', 'শিরোনাম ২'], ['h3', 'শিরোনাম ৩']].map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
      </select>
      <select className="sel font" aria-label={t('ফন্ট')} title={t('ফন্ট')} data-testid="font" value={curFont}
        onChange={(e) => (e.target.value ? chain().setFontFamily(`"${e.target.value}"`).run() : chain().unsetFontFamily().run())}>
        <option value="">{p.defaultFont} ({t('ডিফল্ট')})</option>
        {p.fonts.filter((f) => f !== p.defaultFont).map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <input className="sel size" list="pn-sizes" inputMode="decimal" aria-label={t('ফন্ট সাইজ')} title={t('ফন্ট সাইজ')} data-testid="size"
        key={curSize} defaultValue={curSize}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSize(parseFloat((e.target as HTMLInputElement).value)); } }}
        onBlur={(e) => { const n = parseFloat(e.target.value); if (n && n !== curSize) setSize(n); }} />
      <datalist id="pn-sizes">{FONT_SIZES.map((s) => <option key={s} value={s} />)}</datalist>
      {btn('A+', t('ফন্ট বড়'), false, () => setSize(stepFontSize(curSize, 1)), 'grow')}
      {btn('A−', t('ফন্ট ছোট'), false, () => setSize(stepFontSize(curSize, -1)), 'shrink')}
      <span className="sep" />
      {btn(<b>B</b>, t('গাঢ় (Ctrl/⌘+B)'), ed.isActive('bold'), () => chain().toggleBold().run(), 'bold')}
      {btn(<i>I</i>, t('তির্যক (Ctrl/⌘+I)'), ed.isActive('italic'), () => chain().toggleItalic().run(), 'italic')}
      {btn(<u>U</u>, t('নিচে দাগ (Ctrl/⌘+U)'), ed.isActive('underline'), () => chain().toggleUnderline().run(), 'underline')}
      <span className="sep" />
      <select className="sel align" aria-label={t('সারিবদ্ধতা')} title={t('সারিবদ্ধতা')} data-testid="align" value={align}
        onChange={(e) => (e.target.value ? chain().setTextAlign(e.target.value).run() : chain().unsetTextAlign().run())}>
        <option value="">{t('সারি: স্টাইল অনুযায়ী')}</option>
        <option value="left">⯇ {t('বামে')}</option>
        <option value="center">↔ {t('মাঝে')}</option>
        <option value="right">⯈ {t('ডানে')}</option>
        <option value="justify">☰ {t('দুই পাশ সমান')}</option>
      </select>
      <select className="sel line" aria-label={t('লাইনের ফাঁক')} title={t('লাইনের ফাঁক')} data-testid="line" value={lineVal ?? ''}
        onChange={(e) => chain().setParagraphFormat(e.target.value ? { lineRule: 'auto', lineVal: Number(e.target.value) } : { lineRule: null, lineVal: null }).run()}>
        <option value="">↕ {t('ডিফল্ট')}</option>
        {LINE_SPACINGS.map((v) => <option key={v} value={v}>↕ {v}</option>)}
      </select>
      {btn('⇤', t('Indent কমান'), false, () => chain().indentLess().run(), 'outdent')}
      {btn('⇥', t('Indent বাড়ান'), false, () => chain().indentMore().run(), 'indent')}
      {legal ? (
        btn('১।', t('নম্বর দেওয়া অনুচ্ছেদ'), para.attrs.pstyle === 'numbered', () => toParagraph().setParagraphStyle(para.attrs.pstyle === 'numbered' ? 'normal' : 'numbered').run(), 'numbered')
      ) : (
        <>
          {btn('•', t('বুলেট তালিকা'), ed.isActive('bulletList'), () => chain().toggleBulletList().run(), 'bullets')}
          {btn('1.', t('নম্বর তালিকা'), ed.isActive('orderedList'), () => chain().toggleOrderedList().run(), 'ordered')}
          {btn('☐', t('চেকলিস্ট'), ed.isActive('taskList'), () => chain().toggleTaskList().run(), 'tasks')}
        </>
      )}
      <span className="sep sec" />
      <span className="sec-group">{secondary}</span>
      <span className="more-wrap">
        <Popover label="⋯" title={t('আরও')} testid="more">
          {() => <div className="more-grid">{secondary}</div>}
        </Popover>
      </span>
    </>
  );

  const insert = (
    <>
      {legal && btn(t('তফসিল'), t('তফসিলের টেবিল (৪ কলাম)'), false, () => chain().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run(), 'table-add')}
      <Popover label={t('টেবিল')} title={t('টেবিল ঢোকান')} testid="table-grid">
        {(close) => (
          <div className="menu">
            {[[2, 2], [3, 3], [4, 4], [3, 5], [5, 3]].map(([r, c]) => (
              <button key={r + 'x' + c} type="button" onClick={() => { chain().insertTable({ rows: r, cols: c, withHeaderRow: false }).run(); close(); }}>{r} × {c}</button>
            ))}
          </div>
        )}
      </Popover>
      {btn(t('পাতা ভাঙা'), t('নতুন পাতা (Ctrl/⌘+Enter)'), false, () => chain().setPageBreak().run(), 'page-break')}
      <Popover label="Ω" title={t('বিশেষ চিহ্ন')} testid="symbols">
        {(close) => (
          <div className="swatches sym">
            {SYMBOLS.map((s) => (
              <button key={s} type="button" className="symb" onClick={() => { chain().insertContent(s).run(); close(); }}>{s}</button>
            ))}
          </div>
        )}
      </Popover>
      <Popover label={t('তারিখ')} title={t('আজকের তারিখ')} testid="date">
        {(close) => (
          <div className="menu">
            <button type="button" onClick={() => { chain().insertContent(today()).run(); close(); }}>{today()}</button>
            <button type="button" onClick={() => { chain().insertContent(todayLong()).run(); close(); }}>{todayLong()}</button>
          </div>
        )}
      </Popover>
      <span className="sep" />
      <button type="button" className="tb" disabled title={t('AI সহকারী (শীঘ্রই)')} aria-label={t('AI সহকারী (শীঘ্রই)')} data-testid="ai">✦ AI</button>
    </>
  );

  const tools = (
    <>
      {btn(t('খুঁজুন ও বদলান'), t('খুঁজে বদলান (Ctrl+H)'), false, () => p.onFind(true), 'tools-find')}
      {btn('Converter', t('Converter: ইউনিকোড ⇄ বিজয়'), p.converterOpen, p.onConverter, 'bijoy-toggle')}
      {btn(t('শব্দ গণনা'), t('শব্দ ও অক্ষর গণনা'), false, p.onWordCount, 'word-count')}
    </>
  );

  const table = (
    <>
      {btn(t('+সারি'), t('নিচে সারি যোগ'), false, () => chain().addRowAfter().run(), 'row-add')}
      {btn(t('−সারি'), t('এই সারি মুছুন'), false, () => chain().deleteRow().run(), 'row-del')}
      {btn(t('+কলাম'), t('ডানে কলাম যোগ'), false, () => chain().addColumnAfter().run(), 'col-add')}
      {btn(t('−কলাম'), t('এই কলাম মুছুন'), false, () => chain().deleteColumn().run(), 'col-del')}
      {btn(t('ঘর জোড়া'), t('সিলেক্ট করা ঘর জোড়া লাগান'), false, () => chain().mergeCells().run(), 'merge')}
      {btn(t('ঘর ভাগ'), t('ঘর আলাদা করুন'), false, () => chain().splitCell().run(), 'split')}
      {btn(t('−টেবিল'), t('টেবিল মুছুন'), false, () => chain().deleteTable().run(), 'table-del')}
    </>
  );

  // ----- page tab -----
  const pg = p.page;
  const setPg = (patch: Partial<PageSetup>) => p.onPage(normalizePage({ ...pg, ...patch }, pg));
  const marginId = MARGIN_PRESETS.find((x) => JSON.stringify(x.m) === JSON.stringify(pg.margins))?.id ?? 'custom';
  const pageTab = (
    <>
      <select className="sel paper" aria-label={t('কাগজের মাপ')} title={t('কাগজের মাপ')} data-testid="paper" value={pg.paper}
        onChange={(e) => {
          const id = e.target.value as PaperId;
          if (id === 'custom') return p.onPageSheet();
          setPg({ paper: id, width: PAPERS[id].width, height: PAPERS[id].height });
        }}>
        {Object.entries(PAPERS).map(([id, x]) => <option key={id} value={id}>{x.label}</option>)}
        <option value="custom">{t('নিজের মাপ…')}</option>
      </select>
      {btn(t('খাড়া'), t('খাড়া (Portrait)'), pg.orientation === 'portrait', () => setPg({ orientation: 'portrait' }), 'portrait')}
      {btn(t('আড়াআড়ি'), t('আড়াআড়ি (Landscape)'), pg.orientation === 'landscape', () => setPg({ orientation: 'landscape' }), 'landscape')}
      <span className="sep" />
      <Popover label={t('মার্জিন ▾')} title={t('মার্জিন')} testid="margins">
        {(close) => (
          <div className="menu">
            {MARGIN_PRESETS.map((x) => (
              <button key={x.id} type="button" data-testid={'margin-' + x.id} aria-pressed={marginId === x.id} onClick={() => { setPg({ margins: x.m }); close(); }}>{t(x.label)}</button>
            ))}
            <button type="button" onClick={() => { close(); p.onPageSheet(); }}>{t('নিজের মার্জিন…')}</button>
          </div>
        )}
      </Popover>
      <select className="sel lang" aria-label={t('ডকুমেন্টের ভাষা')} title={t('ডকুমেন্টের ভাষা')} data-testid="doc-lang" value={pg.lang} onChange={(e) => setPg({ lang: e.target.value as PageSetup['lang'] })}>
        <option value="bn">{t('ডকুমেন্ট: বাংলা')}</option>
        <option value="en">{t('ডকুমেন্ট: English')}</option>
      </select>
      <Popover label={t('পাতা নম্বর ▾')} title={t('পাতা নম্বর')} testid="page-numbers">
        {(close) => (
          <div className="menu">
            <button type="button" data-testid="pn-off" aria-pressed={!pg.pageNumbers.show} onClick={() => { setPg({ pageNumbers: { ...pg.pageNumbers, show: false } }); close(); }}>{t('পাতা নম্বর নেই')}</button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" data-testid={'pn-' + a} aria-pressed={pg.pageNumbers.show && pg.pageNumbers.align === a}
                onClick={() => { setPg({ pageNumbers: { ...pg.pageNumbers, show: true, align: a } }); close(); }}>
                {t({ left: 'নিচে বামে', center: 'নিচে মাঝে', right: 'নিচে ডানে' }[a])}
              </button>
            ))}
            <button type="button" data-testid="pn-style" onClick={() => { setPg({ pageNumbers: { ...pg.pageNumbers, style: pg.pageNumbers.style === 'full' ? 'number' : 'full' } }); close(); }}>
              {pg.pageNumbers.style === 'full' ? t('শুধু নম্বর দেখান') : t('পুরো লেখা দেখান (পাতা – ১/৩)')}
            </button>
          </div>
        )}
      </Popover>
      {btn(t('পাতা সেটআপ…'), t('পাতা সেটআপ'), false, p.onPageSheet, 'page-setup')}
    </>
  );

  // ----- view tab -----
  const v = p.view;
  const g = v.grid;
  const setGrid = (patch: Partial<GridPrefs>) => p.setView({ ...v, grid: { ...g, ...patch } });
  const zoomTo = (z: ViewPrefs['zoom']) => p.setView({ ...v, zoom: z });
  const ZOOMS = [50, 75, 90, 100, 125, 150, 200];
  const viewTab = (
    <>
      {btn(t('Print Layout'), t('পাতা আলাদা আলাদা দেখান'), v.layout === 'print', () => p.setView({ ...v, layout: 'print' }), 'layout-print')}
      {btn(t('Web Layout'), t('একটানা পাতা'), v.layout === 'web', () => p.setView({ ...v, layout: 'web' }), 'layout-web')}
      {v.layout === 'print' && <span className="pages" data-testid="page-count">{t('{n} পাতা', { n: p.pages })}</span>}
      <span className="sep" />
      {btn(t('Ruler'), t('মাপকাঠি দেখান/লুকান'), v.ruler, () => p.setView({ ...v, ruler: !v.ruler }), 'ruler-toggle')}
      {v.ruler && btn(v.rulerUnit === 'cm' ? t('সেমি') : t('ইঞ্চি'), t('Ruler-এর একক'), false, () => p.setView({ ...v, rulerUnit: v.rulerUnit === 'cm' ? 'in' : 'cm' }), 'ruler-unit')}
      {btn(t('Gridlines'), t('Gridlines দেখান/লুকান'), g.on, () => setGrid({ on: !g.on }), 'grid-toggle')}
      <Popover label="▾" title={t('Gridlines-এর অপশন')} testid="grid-opts">
        {() => (
          <div className="menu grid-menu">
            <p className="note">{t('ঘরের মাপ')}</p>
            <div className="chips">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button key={s} type="button" data-testid={'grid-' + s} aria-pressed={g.size === s} onClick={() => setGrid({ on: true, size: s })}>
                  {t({ sm: 'ছোট', md: 'মাঝারি', lg: 'বড়' }[s])} ({t('{n} সেমি', { n: GRID_CM[s] })})
                </button>
              ))}
              <button type="button" aria-pressed={g.size === 'custom'} data-testid="grid-custom" onClick={() => setGrid({ on: true, size: 'custom' })}>{t('নিজের মাপ')}</button>
              {g.size === 'custom' && (
                <input className="mini-in" inputMode="decimal" aria-label={t('সেমি')} data-testid="grid-custom-cm" defaultValue={g.custom}
                  onBlur={(e) => { const n = parseFloat(e.target.value); if (n > 0) setGrid({ custom: n }); }} />
              )}
            </div>
            <p className="note">{t('দিক')}</p>
            <div className="chips">
              {(['grid', 'h', 'v', 'dots'] as const).map((d) => (
                <button key={d} type="button" data-testid={'grid-dir-' + d} aria-pressed={g.dir === d} onClick={() => setGrid({ on: true, dir: d })}>
                  {t({ grid: 'ছক', h: 'শুধু আড়াআড়ি', v: 'শুধু খাড়া', dots: 'বিন্দু' }[d])}
                </button>
              ))}
            </div>
            <label className="chk"><input type="checkbox" data-testid="grid-linegrid" checked={g.lineGrid} onChange={(e) => setGrid({ on: true, lineGrid: e.target.checked })} /> {t('লেখার লাইনের গ্রিড (লাইনের ফাঁক অনুযায়ী)')}</label>
            <label className="chk"><input type="checkbox" data-testid="grid-margins" checked={g.margins} onChange={(e) => setGrid({ margins: e.target.checked })} /> {t('মার্জিনের দাগ')}</label>
            <label className="chk"><input type="checkbox" data-testid="grid-center" checked={g.center} onChange={(e) => setGrid({ center: e.target.checked })} /> {t('মাঝের দাগ')}</label>
            <label className="chk"><input type="checkbox" data-testid="grid-tables" checked={g.tables} onChange={(e) => setGrid({ tables: e.target.checked })} /> {t('টেবিলের গ্রিড')}</label>
            <p className="note">{t('গাঢ়ত্ব')}</p>
            <div className="chips">
              {(['light', 'medium', 'dark'] as const).map((s) => (
                <button key={s} type="button" data-testid={'grid-str-' + s} aria-pressed={g.strength === s} onClick={() => setGrid({ strength: s })}>{t({ light: 'হালকা', medium: 'মাঝারি', dark: 'গাঢ়' }[s])}</button>
              ))}
            </div>
          </div>
        )}
      </Popover>
      <span className="sep" />
      {btn('−', t('ছোট করে দেখুন'), false, () => zoomTo(Math.max(25, ([...ZOOMS].reverse().find((z) => z < p.zoomPct - 1) ?? 25))), 'zoom-out')}
      <select className="sel zoom" aria-label="Zoom" title="Zoom" data-testid="zoom" value={typeof v.zoom === 'number' ? String(v.zoom) : v.zoom}
        onChange={(e) => zoomTo(/^\d+$/.test(e.target.value) ? Number(e.target.value) : (e.target.value as 'width' | 'page'))}>
        <option value="width">{t('পাতার চওড়া')} ({p.zoomPct}%)</option>
        <option value="page">{t('পুরো পাতা')}</option>
        {ZOOMS.map((z) => <option key={z} value={z}>{z}%</option>)}
        {typeof v.zoom === 'number' && !ZOOMS.includes(v.zoom) && <option value={v.zoom}>{v.zoom}%</option>}
      </select>
      {btn('+', t('বড় করে দেখুন'), false, () => zoomTo(Math.min(300, ZOOMS.find((z) => z > p.zoomPct + 1) ?? 300)), 'zoom-in')}
      {btn('100%', t('আসল মাপ'), v.zoom === 100, () => zoomTo(100), 'zoom-100')}
    </>
  );

  const tabs: [RibbonTab, string][] = legal
    ? [['home', 'হোম'], ['insert', 'ঢোকান'], ['page', 'পাতা'], ['view', 'View'], ['tools', 'টুলস']]
    : [['home', 'হোম'], ['insert', 'ঢোকান'], ['tools', 'টুলস']];
  if (inTable) tabs.push(['table', 'টেবিল']);
  return (
    <nav className={'ribbon' + (collapsed ? ' collapsed' : '')} aria-label={t('লেখার সরঞ্জাম')}>
      <div className="ribbon-tabs" role="tablist">
        {p.start}
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={'rtab' + (id === 'table' ? ' ctx' : '')} data-testid={'tab-' + id}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { setTab(id); if (collapsed) setCollapsed(false); }}>
            {t(label)}
          </button>
        ))}
        <span className="grow" />
        {p.end}
        <button type="button" className="tb" data-testid="ribbon-collapse" title={collapsed ? t('সরঞ্জাম দেখান') : t('সরঞ্জাম লুকান')} aria-label={collapsed ? t('সরঞ্জাম দেখান') : t('সরঞ্জাম লুকান')}
          onPointerDown={(e) => e.preventDefault()} onClick={() => setCollapsed((c) => !c)}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="ribbon-body" role="tabpanel" data-testid={'panel-' + tab}>
          <div className="ribbon-row">{tab === 'home' ? home : tab === 'insert' ? insert : tab === 'page' ? pageTab : tab === 'view' ? viewTab : tab === 'tools' ? tools : table}</div>
        </div>
      )}
    </nav>
  );
}
