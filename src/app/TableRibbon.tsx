/**
 * Table tools in the ribbon: the Insert tab's table menu, and the two tabs shown while the caret is
 * in a table — টেবিল ডিজাইন (style, borders, shading) and টেবিল লেআউট (rows, columns, sizes,
 * alignment, header repeat, sort, sum). Large touch targets and sheets instead of hover menus (iPad).
 */
import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { TABLE_STYLES, QUICK_TABLES, LINE_WIDTHS, type Delimiter, type CellSide, type TableBorders } from '../editor';
import { useT } from '../i18n';
import { Popover, Sheet } from './ui';

const SHADES = ['#ffffff', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#fff2cc', '#e2efda', '#ddebf7', '#fce4d6', '#ededed', '#c6e0b4', '#bdd7ee', '#f8cbad'];
const LINE_COLORS = ['#000000', '#404040', '#7f7f7f', '#1f3864', '#c00000'];
const CM = 567; // twips per cm
const bn = (s: string | number) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

function useBtn() {
  return (label: ReactNode, title: string, active: boolean, run: () => void, testid?: string, disabled = false) => (
    <button type="button" className={'tb' + (active ? ' on' : '')} title={title} aria-label={title} aria-pressed={active}
      data-testid={testid} disabled={disabled} onPointerDown={(e) => e.preventDefault()} onClick={run}>{label}</button>
  );
}

/* ---------- Insert tab: table menu and sheets ---------- */

export function TableInsertMenu({ ed, say }: { ed: Editor; say: (m: string) => void }) {
  const { t } = useT();
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  const [sheet, setSheet] = useState<'insert' | 'text' | null>(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const [delim, setDelim] = useState<Delimiter>('auto');
  const insert = (r: number, c: number, h: boolean) =>
    ed.chain().focus().newUndoStep().insertTable({ rows: r, cols: c, withHeaderRow: h }).setTableAttrs({ tstyle: 'court', tborders: 'all' }).run();
  return (
    <>
      <Popover label={t('টেবিল ▾')} title={t('টেবিল ঢোকান')} testid="table-grid">
        {(close) => (
          <div className="menu table-menu">
            <div className="tgrid" data-testid="tgrid" onPointerLeave={() => setHover([0, 0])}>
              {Array.from({ length: 8 }, (_, r) =>
                Array.from({ length: 8 }, (_, c) => (
                  <button key={r + '-' + c} type="button" aria-label={`${r + 1} × ${c + 1}`} data-testid={`tg-${r + 1}-${c + 1}`}
                    className={r < hover[0] && c < hover[1] ? 'on' : ''}
                    onPointerEnter={() => setHover([r + 1, c + 1])}
                    onClick={() => { insert(r + 1, c + 1, false); close(); }} />
                )),
              )}
            </div>
            <span className="menu-h">{hover[0] ? `${bn(hover[0])} × ${bn(hover[1])}` : t('ঘর চেপে মাপ বাছুন')}</span>
            <hr />
            <button type="button" data-testid="table-insert-dialog" onClick={() => { close(); setSheet('insert'); }}>{t('টেবিল ঢোকান…')}</button>
            <button type="button" data-testid="text-to-table" onClick={() => { close(); setSheet('text'); }}>{t('লেখা থেকে টেবিল…')}</button>
            <hr />
            <span className="menu-h">{t('তৈরি টেবিল (Quick Table)')}</span>
            {QUICK_TABLES.map((q) => (
              <button key={q.id} type="button" data-testid={'qt-' + q.id} onClick={() => { close(); ed.chain().focus().insertQuickTable(q.id).run(); }}>{t(q.label)}</button>
            ))}
          </div>
        )}
      </Popover>
      {sheet === 'insert' && (
        <Sheet title={t('টেবিল ঢোকান')} onClose={() => setSheet(null)} testid="table-insert-sheet"
          footer={<button type="button" className="btn primary" data-testid="ti-ok" onClick={() => { insert(rows, cols, header); setSheet(null); }}>{t('ঢোকান')}</button>}>
          <div className="form">
            <label>{t('সারি')}<input type="number" inputMode="numeric" min={1} max={200} data-testid="ti-rows" value={rows} onChange={(e) => setRows(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
            <label>{t('কলাম')}<input type="number" inputMode="numeric" min={1} max={20} data-testid="ti-cols" value={cols} onChange={(e) => setCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
            <label className="chk"><input type="checkbox" data-testid="ti-header" checked={header} onChange={(e) => setHeader(e.target.checked)} /> {t('প্রথম সারি হেডার (প্রতি পাতায় আবার আসবে)')}</label>
          </div>
        </Sheet>
      )}
      {sheet === 'text' && (
        <Sheet title={t('লেখা থেকে টেবিল')} onClose={() => setSheet(null)} testid="text-table-sheet"
          footer={
            <button type="button" className="btn primary" data-testid="tt-ok" onClick={() => {
              const ok = ed.chain().focus().textToTable(delim, header).run();
              setSheet(null);
              if (!ok) say('আগে টেবিল বানানোর লাইনগুলো সিলেক্ট করুন');
            }}>{t('টেবিল বানান')}</button>
          }>
          <p className="note">{t('যে লাইনগুলো টেবিল হবে, আগে সেগুলো সিলেক্ট করুন। প্রতিটা লাইন একটা সারি হবে; নিচের চিহ্ন দিয়ে ঘর ভাগ হবে।')}</p>
          <div className="form">
            <label>{t('ঘর ভাগ হবে')}
              <select data-testid="tt-delim" value={delim} onChange={(e) => setDelim(e.target.value as Delimiter)}>
                <option value="auto">{t('নিজে থেকে বুঝে নিক')}</option>
                <option value="tab">{t('ট্যাব')}</option>
                <option value="comma">{t('কমা (,)')}</option>
                <option value="pipe">{t('দাঁড়ি-রেখা (|)')}</option>
                <option value="spaces">{t('দুই বা তার বেশি স্পেস')}</option>
              </select>
            </label>
            <label className="chk"><input type="checkbox" data-testid="tt-header" checked={header} onChange={(e) => setHeader(e.target.checked)} /> {t('প্রথম লাইন হেডার')}</label>
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ---------- Table Design tab ---------- */

export function TableDesignTools({ ed }: { ed: Editor }) {
  const { t } = useT();
  const btn = useBtn();
  const ta = ed.getAttributes('table');
  const chain = () => ed.chain().focus();
  const sides = (s: { t?: boolean; b?: boolean; l?: boolean; r?: boolean }, v: CellSide | null) => chain().setCellSides(s, v).run();
  return (
    <>
      <Popover label={t('স্টাইল ▾')} title={t('টেবিলের স্টাইল')} testid="tstyle">
        {(close) => (
          <div className="menu">
            {TABLE_STYLES.map((s) => (
              <button key={s.id} type="button" data-testid={'tstyle-' + s.id} aria-pressed={ta.tstyle === s.id} onClick={() => { chain().applyTableStyle(s.id).run(); close(); }}>
                <span className={'tsw tsw-' + s.id} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> {t(s.label)}
              </button>
            ))}
          </div>
        )}
      </Popover>
      <span className="sep" />
      {btn(t('হেডার সারি'), t('প্রথম সারি হেডার'), headerOn(ed), () => chain().toggleHeaderRow().run(), 'opt-header')}
      {btn(t('মোট সারি'), t('শেষ সারি মোট (মোটা লেখা)'), !!ta.ttotal, () => chain().setTableAttrs({ ttotal: ta.ttotal ? null : true }).run(), 'opt-total')}
      {btn(t('প্রথম কলাম'), t('প্রথম কলাম মোটা লেখা'), !!ta.tfirstcol, () => chain().setTableAttrs({ tfirstcol: ta.tfirstcol ? null : true }).run(), 'opt-firstcol')}
      {btn(t('ব্যান্ড সারি'), t('এক সারি পর পর হালকা রং'), !!ta.tbanded, () => chain().setTableAttrs({ tbanded: ta.tbanded ? null : true }).run(), 'opt-banded')}
      <span className="sep" />
      <Popover label={t('ঘরের রং ▾')} title={t('সিলেক্ট করা ঘরের রং (Shading)')} testid="shading">
        {(close) => (
          <div className="swatches">
            {SHADES.map((c) => (
              <button key={c} type="button" className="sw" style={{ background: c }} aria-label={c} data-testid={'shade-' + c.slice(1)} onClick={() => { chain().setCellsAttrs({ bg: c }).run(); close(); }} />
            ))}
            <button type="button" className="mini" data-testid="shade-none" onClick={() => { chain().setCellsAttrs({ bg: null }).run(); close(); }}>{t('রং নেই')}</button>
          </div>
        )}
      </Popover>
      <Popover label={t('দাগ ▾')} title={t('টেবিল ও ঘরের দাগ (Borders)')} testid="borders">
        {() => (
          <div className="menu borders-menu">
            <span className="menu-h">{t('পুরো টেবিল')}</span>
            <div className="seg-row">
              {([['all', 'সব'], ['outer', 'বাইরে'], ['inner', 'ভেতরে'], ['hz', 'শুধু আড়াআড়ি'], ['none', 'নেই']] as [TableBorders, string][]).map(([id, l]) => (
                <button key={id} type="button" className="mini" aria-pressed={(ta.tborders ?? 'all') === id} data-testid={'tb-' + id} onClick={() => chain().setTableAttrs({ tborders: id }).run()}>{t(l)}</button>
              ))}
            </div>
            <span className="menu-h">{t('দাগের ধরন')}</span>
            <div className="seg-row">
              {([['single', 'একক'], ['double', 'ডবল'], ['dashed', 'ড্যাশ']] as const).map(([id, l]) => (
                <button key={id} type="button" className="mini" aria-pressed={(ta.tline ?? 'single') === id} data-testid={'tl-' + id} onClick={() => chain().setTableAttrs({ tline: id === 'single' ? null : id }).run()}>{t(l)}</button>
              ))}
            </div>
            <div className="seg-row">
              {LINE_WIDTHS.map((w) => (
                <button key={w} type="button" className="mini" aria-pressed={(ta.tlinew ?? 0.5) === w} data-testid={'tw-' + w} onClick={() => chain().setTableAttrs({ tlinew: w === 0.5 ? null : w }).run()}>{bn(w)} pt</button>
              ))}
            </div>
            <div className="swatches">
              {LINE_COLORS.map((c) => (
                <button key={c} type="button" className="sw" style={{ background: c }} aria-label={c} data-testid={'tc-' + c.slice(1)} onClick={() => chain().setTableAttrs({ tlinec: c === '#000000' ? null : c }).run()} />
              ))}
            </div>
            <span className="menu-h">{t('সিলেক্ট করা ঘর')}</span>
            <div className="seg-row">
              <button type="button" className="mini" data-testid="cs-top" onClick={() => sides({ t: true }, 'single')}>{t('উপরে')}</button>
              <button type="button" className="mini" data-testid="cs-bottom" onClick={() => sides({ b: true }, 'single')}>{t('নিচে')}</button>
              <button type="button" className="mini" data-testid="cs-left" onClick={() => sides({ l: true }, 'single')}>{t('বামে')}</button>
              <button type="button" className="mini" data-testid="cs-right" onClick={() => sides({ r: true }, 'single')}>{t('ডানে')}</button>
            </div>
            <div className="seg-row">
              <button type="button" className="mini" data-testid="cs-bottom-double" onClick={() => sides({ b: true }, 'double')}>{t('নিচে ডবল')}</button>
              <button type="button" className="mini" data-testid="cs-none" onClick={() => sides({ t: true, b: true, l: true, r: true }, 'none')}>{t('দাগ মুছুন')}</button>
              <button type="button" className="mini" data-testid="cs-reset" onClick={() => sides({ t: true, b: true, l: true, r: true }, null)}>{t('টেবিলের মতো')}</button>
            </div>
          </div>
        )}
      </Popover>
    </>
  );
}

function headerOn(ed: Editor) {
  const tbl = ed.state.selection.$from;
  for (let d = tbl.depth; d > 0; d--) {
    const n = tbl.node(d);
    if (n.type.name === 'table') {
      const first = n.firstChild;
      let all = !!first && first.childCount > 0;
      first?.forEach((c) => { if (c.type.name !== 'tableHeader') all = false; });
      return all;
    }
  }
  return false;
}

/* ---------- Table Layout tab ---------- */

const ALIGNS: ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'][] = [
  ['top', 'left'], ['top', 'center'], ['top', 'right'],
  ['middle', 'left'], ['middle', 'center'], ['middle', 'right'],
  ['bottom', 'left'], ['bottom', 'center'], ['bottom', 'right'],
];

export function TableLayoutTools({ ed, say }: { ed: Editor; say: (m: string) => void }) {
  const { t } = useT();
  const btn = useBtn();
  const chain = () => ed.chain().focus();
  const ta = ed.getAttributes('table');
  const ra = ed.getAttributes('tableRow');
  const [sheet, setSheet] = useState<'size' | 'sort' | null>(null);
  const [colCm, setColCm] = useState('3');
  const [rowCm, setRowCm] = useState('');
  const [padCm, setPadCm] = useState('');
  const [sortCol, setSortCol] = useState(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortAs, setSortAs] = useState<'auto' | 'text' | 'number'>('auto');
  const cols = columnNames(ed);
  const repeatOn = ra.rrepeat === true || (ra.rrepeat !== false && rowIsHeader(ed));
  const run = (ok: boolean, fail: string) => { if (!ok) say(fail); };
  return (
    <>
      <Popover label={t('সিলেক্ট ▾')} title={t('সিলেক্ট করুন')} testid="tsel">
        {(close) => (
          <div className="menu">
            {([['cell', 'এই ঘর'], ['row', 'এই সারি'], ['column', 'এই কলাম'], ['table', 'পুরো টেবিল']] as const).map(([k, l]) => (
              <button key={k} type="button" data-testid={'sel-' + k} onClick={() => { chain().selectTablePart(k).run(); close(); }}>{t(l)}</button>
            ))}
          </div>
        )}
      </Popover>
      <Popover label={t('মুছুন ▾')} title={t('মুছুন')} testid="tdel">
        {(close) => (
          <div className="menu">
            <button type="button" data-testid="clear-cells" onClick={() => { chain().clearCells().run(); close(); }}>{t('ঘরের লেখা মুছুন')}</button>
            <button type="button" data-testid="row-del" onClick={() => { chain().deleteRow().run(); close(); }}>{t('এই সারি মুছুন')}</button>
            <button type="button" data-testid="col-del" onClick={() => { chain().deleteColumn().run(); close(); }}>{t('এই কলাম মুছুন')}</button>
            <button type="button" className="danger" data-testid="table-del" onClick={() => { chain().deleteTable().run(); close(); }}>{t('পুরো টেবিল মুছুন')}</button>
          </div>
        )}
      </Popover>
      <span className="sep" />
      {btn(t('↑ সারি'), t('উপরে সারি যোগ'), false, () => chain().addRowBefore().run(), 'row-add-above')}
      {btn(t('↓ সারি'), t('নিচে সারি যোগ'), false, () => chain().addRowAfter().run(), 'row-add')}
      {btn(t('← কলাম'), t('বামে কলাম যোগ'), false, () => chain().addColumnBefore().run(), 'col-add-left')}
      {btn(t('→ কলাম'), t('ডানে কলাম যোগ'), false, () => chain().addColumnAfter().run(), 'col-add')}
      <span className="sep" />
      {btn(t('ঘর জোড়া'), t('সিলেক্ট করা ঘর জোড়া লাগান'), false, () => run(chain().mergeCells().run(), 'জোড়া লাগাতে আগে কয়েকটা ঘর সিলেক্ট করুন'), 'merge')}
      {btn(t('ঘর ভাগ'), t('জোড়া ঘর আলাদা করুন'), false, () => run(chain().splitCell().run(), 'এই ঘর জোড়া লাগানো নয়'), 'split')}
      {btn(t('টেবিল ভাগ'), t('এই সারি থেকে টেবিল দুই ভাগ'), false, () => run(chain().splitTable().run(), 'প্রথম সারিতে বা জোড়া ঘরের টেবিলে ভাগ করা যায় না'), 'split-table')}
      <span className="sep" />
      <Popover label={t('অ্যালাইন ▾')} title={t('ঘরের ভেতরে লেখার জায়গা')} testid="talign">
        {(close) => (
          <div className="menu">
            <div className="align9" data-testid="align9">
              {ALIGNS.map(([v, h]) => (
                <button key={v + h} type="button" aria-label={v + ' ' + h} data-testid={`al-${v}-${h}`} onClick={() => { chain().setCellAlign(v, h).run(); close(); }}>
                  <i style={{ alignSelf: v === 'top' ? 'flex-start' : v === 'middle' ? 'center' : 'flex-end', justifySelf: h === 'left' ? 'start' : h === 'center' ? 'center' : 'end' }} />
                </button>
              ))}
            </div>
            <span className="menu-h">{t('পুরো টেবিল পাতার')}</span>
            <div className="seg-row">
              {([['left', 'বামে'], ['center', 'মাঝে'], ['right', 'ডানে']] as const).map(([k, l]) => (
                <button key={k} type="button" className="mini" aria-pressed={(ta.talign ?? 'left') === k} data-testid={'tpos-' + k} onClick={() => chain().setTableAttrs({ talign: k === 'left' ? null : k }).run()}>{t(l)}</button>
              ))}
            </div>
          </div>
        )}
      </Popover>
      <Popover label="AutoFit ▾" title={t('টেবিলের মাপ নিজে থেকে')} testid="autofit">
        {(close) => (
          <div className="menu">
            <button type="button" data-testid="fit-contents" onClick={() => { chain().autoFit('contents').run(); close(); }}>{t('লেখা অনুযায়ী')}</button>
            <button type="button" data-testid="fit-window" onClick={() => { chain().autoFit('window').run(); close(); }}>{t('পাতা জুড়ে')}</button>
            <button type="button" data-testid="fit-fixed" onClick={() => { chain().autoFit('fixed', measureColumns(ed)).run(); close(); }}>{t('এখনকার মাপে স্থির')}</button>
            <hr />
            <button type="button" data-testid="dist-cols" onClick={() => { chain().distributeColumns().run(); close(); }}>{t('কলাম সমান চওড়া')}</button>
            <button type="button" data-testid="dist-rows" onClick={() => { chain().distributeRows(averageRowTwips(ed)).run(); close(); }}>{t('সারি সমান উঁচু')}</button>
          </div>
        )}
      </Popover>
      {btn(t('মাপ…'), t('কলামের চওড়া, সারির উচ্চতা, ঘরের ভেতরের ফাঁক'), false, () => setSheet('size'), 'tsize')}
      <span className="sep" />
      {btn(t('হেডার প্রতি পাতায়'), t('এই হেডার সারি প্রতিটা পাতায় আবার আসবে (Word ফাইলে)'), repeatOn, () => chain().setRowsAttrs({ rrepeat: !repeatOn }).run(), 'row-repeat')}
      {btn(t('সারি ভাঙবে না'), t('এই সারি দুই পাতায় ভাগ হবে না'), !!ra.rkeep, () => chain().setRowsAttrs({ rkeep: ra.rkeep ? null : true }).run(), 'row-keep')}
      <span className="sep" />
      {btn(t('সাজান…'), t('কলাম ধরে সারি সাজান'), false, () => setSheet('sort'), 'tsort')}
      {btn('Σ ' + t('যোগফল'), t('এই কলামের সংখ্যাগুলো যোগ করে মোট সারিতে'), false, () => run(chain().sumColumn().run(), 'এই কলামে যোগ করার মতো সংখ্যা নেই (বা টেবিলে জোড়া ঘর আছে)'), 'tsum')}
      {btn(t('টেবিল থেকে লেখা'), t('টেবিল সরিয়ে লেখা রাখুন (ঘরগুলো ট্যাব দিয়ে আলাদা)'), false, () => chain().tableToText().run(), 'table-to-text')}

      {sheet === 'size' && (
        <Sheet title={t('টেবিলের মাপ')} onClose={() => setSheet(null)} testid="tsize-sheet">
          <div className="form">
            <label>{t('এই কলামের চওড়া (সেমি)')}
              <span className="row"><input inputMode="decimal" data-testid="ts-col" value={colCm} onChange={(e) => setColCm(e.target.value)} />
                <button type="button" className="btn small" data-testid="ts-col-ok" onClick={() => { const v = parseFloat(colCm); if (v > 0) chain().setColumnWidth(Math.round(v * CM)).run(); }}>{t('বসান')}</button></span>
            </label>
            <label>{t('এই সারির উচ্চতা, অন্তত (সেমি; খালি = লেখা অনুযায়ী)')}
              <span className="row"><input inputMode="decimal" data-testid="ts-row" value={rowCm} onChange={(e) => setRowCm(e.target.value)} />
                <button type="button" className="btn small" data-testid="ts-row-ok" onClick={() => { const v = parseFloat(rowCm); chain().setRowsAttrs({ rheight: v > 0 ? Math.round(v * CM) : null }).run(); }}>{t('বসান')}</button></span>
            </label>
            <label>{t('ঘরের ভেতরে দুই পাশের ফাঁক (সেমি)')}
              <span className="row"><input inputMode="decimal" data-testid="ts-pad" value={padCm} placeholder="0.19" onChange={(e) => setPadCm(e.target.value)} />
                <button type="button" className="btn small" data-testid="ts-pad-ok" onClick={() => { const v = parseFloat(padCm); chain().setTableAttrs({ tpad: v >= 0 ? Math.round(v * CM) : null }).run(); }}>{t('বসান')}</button></span>
            </label>
          </div>
        </Sheet>
      )}
      {sheet === 'sort' && (
        <Sheet title={t('সারি সাজান')} onClose={() => setSheet(null)} testid="tsort-sheet"
          footer={<button type="button" className="btn primary" data-testid="sort-ok" onClick={() => { run(chain().sortTable(sortCol, sortDir, sortAs).run(), 'সাজানো গেল না: কমপক্ষে দুটো সারি লাগে, আর জোড়া ঘর থাকা চলবে না'); setSheet(null); }}>{t('সাজান')}</button>}>
          <p className="note">{t('হেডার সারি আর মোট সারি জায়গায় থাকে; বাকি সারিগুলো সাজানো হয়।')}</p>
          <div className="form">
            <label>{t('কোন কলাম ধরে')}
              <select data-testid="sort-col" value={sortCol} onChange={(e) => setSortCol(Number(e.target.value))}>
                {cols.map((c, i) => <option key={i} value={i}>{c || t('কলাম {n}', { n: i + 1 })}</option>)}
              </select>
            </label>
            <label>{t('ক্রম')}
              <select data-testid="sort-dir" value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}>
                <option value="asc">{t('ছোট থেকে বড় / ক থেকে হ')}</option>
                <option value="desc">{t('বড় থেকে ছোট / হ থেকে ক')}</option>
              </select>
            </label>
            <label>{t('ধরন')}
              <select data-testid="sort-as" value={sortAs} onChange={(e) => setSortAs(e.target.value as 'auto' | 'text' | 'number')}>
                <option value="auto">{t('নিজে থেকে বুঝে নিক')}</option>
                <option value="number">{t('সংখ্যা')}</option>
                <option value="text">{t('লেখা')}</option>
              </select>
            </label>
          </div>
        </Sheet>
      )}
    </>
  );
}

function rowIsHeader(ed: Editor): boolean {
  const $p = ed.state.selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.type.name === 'tableRow') {
      let all = n.childCount > 0;
      n.forEach((c) => { if (c.type.name !== 'tableHeader') all = false; });
      return all;
    }
  }
  return false;
}

/** Column titles (first row) of the table at the caret, for the sort sheet. */
function columnNames(ed: Editor): string[] {
  const $p = ed.state.selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.type.name === 'table') {
      const names: string[] = [];
      n.firstChild?.forEach((c) => names.push(c.textContent.trim()));
      return names;
    }
  }
  return [];
}

function tableDom(ed: Editor): HTMLTableElement | null {
  const { node } = ed.view.domAtPos(ed.state.selection.from);
  let el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
  while (el && el.tagName !== 'TABLE') el = el.parentElement;
  return el as HTMLTableElement | null;
}

/** Current column widths in twips (measured on screen at 100% zoom). */
function measureColumns(ed: Editor): number[] {
  const tbl = tableDom(ed);
  const row = tbl?.rows[0];
  if (!row) return [];
  const z = Number(getComputedStyle(tbl!).zoom) || 1;
  const widths: number[] = [];
  for (const c of Array.from(row.cells)) for (let k = 0; k < c.colSpan; k++) widths.push(Math.round(((c.getBoundingClientRect().width / z) / c.colSpan) * 15));
  return widths;
}

function averageRowTwips(ed: Editor): number {
  const tbl = tableDom(ed);
  if (!tbl || !tbl.rows.length) return 400;
  const z = Number(getComputedStyle(tbl).zoom) || 1;
  const sum = Array.from(tbl.rows).reduce((s, r) => s + r.getBoundingClientRect().height / z, 0);
  return Math.round((sum / tbl.rows.length) * 15);
}
