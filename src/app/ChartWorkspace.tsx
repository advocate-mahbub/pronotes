/**
 * Title chart page: the chain is written as steps on the left (records, inheritance, deeds, a merge of
 * several sources, boxed notes), and drawn on the right as it is typed, in the owner's court format.
 * Every box types Bangla with the chosen layout. Saved on this device as the document's chart data.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chartPageSvg, check, type Receiver, type Step, type Survey, type TitleChart } from '../chart';
import { saveChart, type Doc } from '../storage/db';
import { saveFile } from '../storage/download';
import { useT } from '../i18n';
import { load, save } from './prefs';
import { BnInput, BnTextarea, type BnProps } from './BnInput';

const RELATIONS = ['স্ত্রী', 'স্বামী', 'পুত্র', 'কন্যা', 'মাতা', 'পিতা', 'ভাই', 'বোন', 'চাচা', 'ফুফু', 'নাতি', 'নাতনী'];
const DEED_TYPES = ['সাফ কবলা', 'হেবা', 'হেবা-বিল-এওয়াজ', 'দানপত্র', 'বণ্টননামা', 'এওয়াজ', 'না-দাবী', 'পাওয়ার', 'পরিমাণ'];
const SURVEYS: Survey[] = ['CS', 'SA', 'RS', 'BS', 'PS', 'City', 'Diara'];
const SURVEY_OWNER: Record<Survey, string> = {
  CS: 'সিএস রেকর্ডিয় মালিক', SA: 'এসএ রেকর্ডীয় মালিক', RS: 'আরএস রেকর্ডীয় মালিক', BS: 'বিএস রেকর্ডীয় মালিক',
  PS: 'পিএস রেকর্ডীয় মালিক', City: 'সিটি রেকর্ডীয় মালিক', Diara: 'দিয়ারা রেকর্ডীয় মালিক',
};
const MERGE_CAPTION = 'ওয়ারিশ ও খরিদসূত্রে মালিক';
const KIND_NAME: Record<Step['kind'], string> = { record: 'রেকর্ডের মালিক', inheritance: 'ওয়ারিশ', deed: 'দলিল', merge: 'একত্র মালিক', note: 'নোট বক্স' };

export const emptyChart = (): TitleChart => ({ heading: [], persons: [], steps: [], notes: [], preparedBy: load<string[]>('chart.preparedBy', []) });

/** Persons are their names: the same name is the same person. */
export function withPersons(c: TitleChart): TitleChart {
  const names = new Set<string>();
  const add = (n?: string) => n && n.trim() && names.add(n);
  for (const s of c.steps) {
    if (s.kind === 'record') s.owners.forEach((o) => add(o.person));
    else if (s.kind === 'inheritance') { add(s.deceased); s.heirs.forEach((h) => add(h.person)); }
    else if (s.kind === 'deed') { s.from.forEach(add); s.to.forEach((r) => add(r.person)); }
    else if (s.kind === 'merge') add(s.person);
    else s.through.forEach(add);
  }
  return { ...c, persons: [...names].map((n) => ({ id: n, name: n })) };
}
/** Names and deed numbers, so the chart is found by search. */
const textOf = (c: TitleChart) => [...(c.heading ?? []), ...c.persons.map((p) => p.name), ...c.steps.flatMap((s) => (s.kind === 'deed' ? [s.no] : []))].join(' ');

const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const lines = (v: string) => v.split(';').map((x) => x.trim()).filter(Boolean);
const joinLines = (l?: string[]) => (l ?? []).join('; ');

function freshStep(kind: Step['kind']): Step {
  const id = newId();
  switch (kind) {
    case 'record': return { id, kind, survey: 'CS', owners: [{ person: '', label: SURVEY_OWNER.CS }] };
    case 'inheritance': return { id, kind, deceased: '', heirs: [{ person: '', relation: '' }] };
    case 'deed': return { id, kind, no: '', date: '', type: 'সাফ কবলা', area: '', from: [''], to: [{ person: '' }] };
    case 'merge': return { id, kind, person: '', caption: MERGE_CAPTION };
    case 'note': return { id, kind, lines: [''], through: [''] };
  }
}

interface Props extends BnProps {
  doc: Doc;
  say: (m: string, v?: Record<string, string | number>) => void;
  onRename: (id: string, title: string) => void;
  toolbarExtra?: ReactNode;
}

export function ChartWorkspace(p: Props) {
  const { t } = useT();
  const [chart, setChart] = useState<TitleChart>(() => p.doc.chart ?? emptyChart());
  const [title, setTitle] = useState(p.doc.title);
  const dirty = useRef(false);
  const latest = useRef(chart);
  latest.current = chart;

  // saved a moment after each change, and at once when the page closes or the document changes
  const flush = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const c = withPersons(latest.current);
    void saveChart(p.doc.id, c, textOf(c)).then(() => window.dispatchEvent(new Event('pronotes-saved')));
  };
  useEffect(() => {
    if (!dirty.current) return;
    const tm = setTimeout(flush, 400);
    return () => clearTimeout(tm);
  }, [chart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const away = () => flush();
    window.addEventListener('pagehide', away);
    return () => { window.removeEventListener('pagehide', away); flush(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn: (c: TitleChart) => void) => {
    dirty.current = true;
    setChart((c) => { const n = structuredClone(c); fn(n); return n; });
  };
  const editStep = <K extends Step['kind']>(i: number, fn: (s: Extract<Step, { kind: K }>) => void) => edit((c) => fn(c.steps[i] as Extract<Step, { kind: K }>));

  const full = useMemo(() => withPersons(chart), [chart]);
  const svg = useMemo(() => chartPageSvg(full), [full]);
  const problems = useMemo(() => check(full).problems, [full]);
  const names = full.persons.map((x) => x.name);

  const bn = { cfg: p.cfg, toggle: p.toggle };
  const txt = (value: string | undefined, onChange: (v: string) => void, placeholder: string, extra: { list?: string; testid?: string; cls?: string; inputMode?: 'decimal' | 'numeric' } = {}) => (
    <BnInput {...bn} className={'cf ' + (extra.cls ?? '')} value={value ?? ''} placeholder={t(placeholder)} aria-label={t(placeholder)} title={t(placeholder)}
      list={extra.list} data-testid={extra.testid} inputMode={extra.inputMode} onChange={(e) => onChange(e.target.value)} />
  );
  const btn = (label: string, onClick: () => void, testid?: string, cls = '') => (
    <button type="button" className={'btn small ' + cls} data-testid={testid} onClick={onClick}>{label}</button>
  );
  const receiver = (r: Receiver, set: (fn: (r: Receiver) => void) => void, remove: (() => void) | null, testid: string, opts: { relation?: boolean } = {}) => (
    <div className="cf-row" data-testid={testid}>
      {opts.relation !== false && txt(r.relation, (v) => set((x) => { x.relation = v; }), 'সম্পর্ক', { list: 'chart-relations', cls: 'w-rel', testid: testid + '-rel' })}
      {txt(r.person, (v) => set((x) => { x.person = v; }), 'নাম', { list: 'chart-names', cls: 'w-name', testid: testid + '-name' })}
      {txt(r.share, (v) => set((x) => { x.share = v; }), 'অংশ (১/৪, ৫ আনা)', { cls: 'w-num', testid: testid + '-share' })}
      {txt(r.area, (v) => set((x) => { x.area = v; }), 'জমি (শতক)', { cls: 'w-num', testid: testid + '-area', inputMode: 'decimal' })}
      {txt(joinLines(r.lines), (v) => set((x) => { x.lines = lines(v); }), 'অন্য লাইন (; দিয়ে আলাদা)', { cls: 'w-lines', testid: testid + '-lines' })}
      {remove && <button type="button" className="cf-x" aria-label={t('মুছুন')} title={t('মুছুন')} onClick={remove}>✕</button>}
    </div>
  );

  const stepCard = (s: Step, i: number) => {
    const move = (d: -1 | 1) => edit((c) => { const j = i + d; if (j < 0 || j >= c.steps.length) return; [c.steps[i], c.steps[j]] = [c.steps[j], c.steps[i]]; });
    let body: ReactNode = null;
    if (s.kind === 'record') {
      body = (
        <>
          <label className="cf-line">{t('জরিপ')}
            <select value={s.survey} data-testid={`st${i}-survey`} onChange={(e) => editStep<'record'>(i, (x) => {
              const sv = e.target.value as Survey;
              x.owners.forEach((o) => { if (!o.label || o.label === SURVEY_OWNER[x.survey]) o.label = SURVEY_OWNER[sv]; });
              x.survey = sv;
            })}>{SURVEYS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
          {s.owners.map((o, k) => receiver(o, (fn) => editStep<'record'>(i, (x) => fn(x.owners[k])), s.owners.length > 1 ? () => editStep<'record'>(i, (x) => { x.owners.splice(k, 1); }) : null, `st${i}-o${k}`, { relation: false }))}
          {btn('+ ' + t('মালিক'), () => editStep<'record'>(i, (x) => { x.owners.push({ person: '', label: SURVEY_OWNER[x.survey] }); }), `st${i}-add`)}
        </>
      );
    } else if (s.kind === 'inheritance') {
      body = (
        <>
          <div className="cf-line">{t('মৃত')} {txt(s.deceased, (v) => editStep<'inheritance'>(i, (x) => { x.deceased = v; }), 'যিনি মারা গেছেন', { list: 'chart-names', cls: 'w-name', testid: `st${i}-deceased` })}</div>
          {s.heirs.map((h, k) => receiver(h, (fn) => editStep<'inheritance'>(i, (x) => fn(x.heirs[k])), s.heirs.length > 1 ? () => editStep<'inheritance'>(i, (x) => { x.heirs.splice(k, 1); }) : null, `st${i}-h${k}`))}
          {btn('+ ' + t('ওয়ারিশ'), () => editStep<'inheritance'>(i, (x) => { x.heirs.push({ person: '', relation: '' }); }), `st${i}-add`)}
        </>
      );
    } else if (s.kind === 'deed') {
      body = (
        <>
          <div className="cf-row">
            {txt(s.no, (v) => editStep<'deed'>(i, (x) => { x.no = v; }), 'দলিল নং', { cls: 'w-num', testid: `st${i}-no`, inputMode: 'numeric' })}
            {txt(s.date, (v) => editStep<'deed'>(i, (x) => { x.date = v; }), 'তারিখ (দিন/মাস/বছর)', { cls: 'w-date', testid: `st${i}-date` })}
            {txt(s.type, (v) => editStep<'deed'>(i, (x) => { x.type = v; }), 'ধরন', { list: 'chart-deeds', testid: `st${i}-type` })}
            {txt(s.area, (v) => editStep<'deed'>(i, (x) => { x.area = v; }), 'জমি (শতক)', { cls: 'w-num', testid: `st${i}-area`, inputMode: 'decimal' })}
          </div>
          <div className="cf-line">{t('দাতা')}
            {s.from.map((f, k) => (
              <span key={k} className="cf-chip">
                {txt(f, (v) => editStep<'deed'>(i, (x) => { x.from[k] = v; }), 'দাতার নাম', { list: 'chart-names', cls: 'w-name', testid: `st${i}-from${k}` })}
                {s.from.length > 1 && <button type="button" className="cf-x" aria-label={t('মুছুন')} onClick={() => editStep<'deed'>(i, (x) => { x.from.splice(k, 1); })}>✕</button>}
              </span>
            ))}
            {btn('+', () => editStep<'deed'>(i, (x) => { x.from.push(''); }), `st${i}-addfrom`)}
          </div>
          <div className="cf-sub">{t('গ্রহীতা')}</div>
          {s.to.map((r, k) => receiver(r, (fn) => editStep<'deed'>(i, (x) => fn(x.to[k])), s.to.length > 1 ? () => editStep<'deed'>(i, (x) => { x.to.splice(k, 1); }) : null, `st${i}-t${k}`))}
          <div className="cf-row">
            {btn('+ ' + t('গ্রহীতা'), () => editStep<'deed'>(i, (x) => { x.to.push({ person: '' }); }), `st${i}-add`)}
            {txt(joinLines(s.lines), (v) => editStep<'deed'>(i, (x) => { x.lines = lines(v); }), 'দলিলের নিচে লাইন (; দিয়ে আলাদা)', { cls: 'w-lines', testid: `st${i}-lines` })}
          </div>
        </>
      );
    } else if (s.kind === 'merge') {
      body = (
        <div className="cf-row">
          {txt(s.caption, (v) => editStep<'merge'>(i, (x) => { x.caption = v; }), 'ওপরের লেখা', { cls: 'w-lines', testid: `st${i}-caption` })}
          {txt(s.person, (v) => editStep<'merge'>(i, (x) => { x.person = v; }), 'নাম', { list: 'chart-names', cls: 'w-name', testid: `st${i}-name` })}
          {txt(joinLines(s.lines), (v) => editStep<'merge'>(i, (x) => { x.lines = lines(v); }), 'অন্য লাইন (; দিয়ে আলাদা)', { cls: 'w-lines', testid: `st${i}-lines` })}
        </div>
      );
    } else {
      body = (
        <>
          <BnTextarea {...bn} className="cf cf-area" rows={3} value={s.lines.join('\n')} placeholder={t('বক্সের লেখা, প্রতি লাইন আলাদা')} data-testid={`st${i}-text`}
            onChange={(e) => editStep<'note'>(i, (x) => { x.lines = e.target.value.split('\n'); })} />
          <div className="cf-line">{t('কার জমি এর ভেতর দিয়ে যায়')}
            {s.through.map((f, k) => (
              <span key={k} className="cf-chip">{txt(f, (v) => editStep<'note'>(i, (x) => { x.through[k] = v; }), 'নাম', { list: 'chart-names', cls: 'w-name', testid: `st${i}-thr${k}` })}</span>
            ))}
            {btn('+', () => editStep<'note'>(i, (x) => { x.through.push(''); }))}
          </div>
        </>
      );
    }
    const bad = problems.filter((x) => x.step === s.id);
    return (
      <section key={s.id} className={'cf-step' + (bad.length ? ' bad' : '')} data-testid={'step-' + i} data-kind={s.kind}>
        <header>
          <span className="cf-n">{i + 1}</span>
          <strong>{t(KIND_NAME[s.kind])}</strong>
          <span className="cf-tools">
            <button type="button" aria-label={t('ওপরে')} title={t('ওপরে')} disabled={i === 0} onClick={() => move(-1)}>↑</button>
            <button type="button" aria-label={t('নিচে')} title={t('নিচে')} disabled={i === chart.steps.length - 1} onClick={() => move(1)}>↓</button>
            <button type="button" aria-label={t('ধাপ মুছুন')} title={t('ধাপ মুছুন')} data-testid={`st${i}-del`}
              onClick={() => { if (confirm(t('এই ধাপ মুছবেন?'))) edit((c) => { c.steps.splice(i, 1); }); }}>✕</button>
          </span>
        </header>
        {body}
        {bad.map((x, k) => <p key={k} className="cf-bad" role="alert">⚠ {x.text}</p>)}
      </section>
    );
  };

  // everyone who receives land somewhere, for the ring
  const ringChoices = chart.steps.flatMap((s) => {
    const rs = s.kind === 'record' ? s.owners : s.kind === 'inheritance' ? s.heirs : s.kind === 'deed' ? s.to : s.kind === 'merge' ? [{ person: s.person }] : [];
    return rs.filter((r) => r.person).map((r) => ({ value: s.id + '|' + r.person, label: `${r.person} (${t(KIND_NAME[s.kind])})` }));
  });

  const print = () => {
    flush();
    const host = document.createElement('div');
    host.className = 'chart-print';
    host.innerHTML = svg;
    const style = document.createElement('style');
    style.textContent = '@page { size: 8.5in 14in; margin: 0; }';
    document.body.append(host, style);
    document.body.classList.add('chart-printing');
    const done = () => { host.remove(); style.remove(); document.body.classList.remove('chart-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch { p.say('এখানে প্রিন্ট করা যায় না'); }
    setTimeout(done, 60_000);
  };
  const downloadSvg = () => void saveFile((title || 'title-chart') + '.svg', new Blob([svg], { type: 'image/svg+xml' }));

  return (
    <div className="chart-ws" data-testid="chart-ws">
      <div className="chart-bar">
        {p.toolbarExtra}
        <BnInput {...bn} className="title chart-title" data-testid="title" value={title} aria-label={t('চার্টের নাম')} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== p.doc.title && p.onRename(p.doc.id, title)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <button type="button" className="btn small primary" data-testid="chart-print" onClick={print}>{t('প্রিন্ট / PDF')}</button>
        <button type="button" className="btn small" data-testid="chart-svg" onClick={downloadSvg}>SVG</button>
      </div>
      <div className="chart-split">
        <div className="chart-form" data-testid="chart-form">
          <datalist id="chart-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="chart-relations">{RELATIONS.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="chart-deeds">{DEED_TYPES.map((n) => <option key={n} value={n} />)}</datalist>
          <section className="cf-step">
            <header><strong>{t('ওপরের লেখা')}</strong></header>
            <BnTextarea {...bn} className="cf cf-area" rows={2} data-testid="chart-heading" value={(chart.heading ?? []).join('\n')}
              placeholder={t('আদালত; পরের লাইনে মোকদ্দমা নং')} onChange={(e) => edit((c) => { c.heading = e.target.value.split('\n'); })} />
          </section>
          {chart.steps.map(stepCard)}
          <div className="cf-add" role="group" aria-label={t('ধাপ যোগ করুন')}>
            {(['record', 'inheritance', 'deed', 'merge', 'note'] as Step['kind'][]).map((k) =>
              btn('+ ' + t(KIND_NAME[k]), () => edit((c) => { c.steps.push(freshStep(k)); }), 'add-' + k))}
          </div>
          <section className="cf-step">
            <header><strong>{t('বৃত্ত')}</strong></header>
            <select data-testid="chart-ring" value={chart.highlight ? chart.highlight.step + '|' + chart.highlight.person : ''}
              onChange={(e) => edit((c) => { const [step, person] = e.target.value.split('|'); c.highlight = step ? { step, person } : undefined; })}>
              <option value="">{t('কাউকে নয়')}</option>
              {ringChoices.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </section>
          <section className="cf-step">
            <header><strong>{t('নিচের লেখা')}</strong></header>
            <BnTextarea {...bn} className="cf cf-area" rows={4} data-testid="chart-notes" value={(chart.notes ?? []).join('\n')}
              placeholder={t('যুক্তি; প্রতি লাইন একটা অনুচ্ছেদ')} onChange={(e) => edit((c) => { c.notes = e.target.value.split('\n'); })} />
            <BnTextarea {...bn} className="cf cf-area" rows={4} data-testid="chart-prepared" value={(chart.preparedBy ?? []).join('\n')}
              placeholder={'Research & Prepared By:\n…'} onChange={(e) => edit((c) => { c.preparedBy = e.target.value.split('\n'); })} />
            {btn(t('এটা সব নতুন চার্টে রাখুন'), () => { save('chart.preparedBy', chart.preparedBy ?? []); p.say('নতুন চার্টে এই "Prepared By" বসবে'); }, 'chart-prepared-default')}
          </section>
        </div>
        <div className="chart-preview-wrap">
          {problems.length > 0 && <p className="cf-bad" data-testid="chart-problems">⚠ {t('{n}টা গরমিল — ধাপের নিচে লাল লেখা দেখুন', { n: problems.length })}</p>}
          <div className="chart-preview" data-testid="chart-preview" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    </div>
  );
}
