/**
 * ডিকশনারি (decisions.md 92): one search box (Bangla letters search the Bangla terms, the rest the English
 * ones), a clean card for the chosen word, and everything else — import, new term, duplicate check, editing —
 * out of the way until asked for. Copies of one headword show as one word with numbered meanings. A second
 * tab holds the learner word lists (Oxford 3000 / 5000), kept apart from the law data.
 * This screen keeps its own two-language labels: Bangla menu in Bangla, English menu fully English.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { num, useT } from '../i18n';
import './dictionary.css';
import { readZip } from '../../apps-site/zip';
import { geminiGenerate } from '../ai/gemini';
import {
  addDictionaryEquivalent, addDictionarySense, updateDictionarySense, deleteDictionarySense, addDictionaryTranslation, setDictionaryEquivalentReviewStatus,
  updateDictionaryEquivalent, deleteDictionaryEquivalent, findDictionaryDuplicateGroups, createBanglaDictionaryEntry, getDictionaryLinkedEntries,
  linkDictionaryEquivalent, searchBanglaDictionary, countDictionaryEntries, getDictionaryEquivalents, getDictionarySenses, importOxfordDictionaryJsonl,
  searchDictionary, importWordList, countWordList, searchWordList,
  type DictionaryEntry, type DictionaryEquivalent, type DictionarySense, type WordListItem,
} from '../storage';

/** A line-broken PDF paragraph made one paragraph again ("con-\ntract" stays "con-tract"). */
export function reflow(s: string): string {
  return s.replace(/-\n(?=\S)/g, '-').replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim();
}
/** Search results: copies of one headword (same spelling, same language) become one word. */
export function groupEntries(list: DictionaryEntry[]): DictionaryEntry[][] {
  const by = new Map<string, DictionaryEntry[]>();
  for (const e of list) {
    const k = e.language + ':' + e.normalizedTitle;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return [...by.values()];
}
const isBangla = (s: string) => /[\u0980-\u09ff]/.test(s);
/** The book starts each entry with its headword and part of speech; the card already shows them. */
export function withoutHead(def: string, title: string): string {
  const t = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return def.replace(new RegExp('^' + t + '\\s+(?:(?:n|v|vb|adj|adv|pl|abbrev|prep)\\.\\s*)?', 'i'), '') || def;
}
/** "*deed" in the book marks a word that has its own entry: shown as a link to it. */
function Marked({ text, onWord }: { text: string; onWord: (w: string) => void }) {
  const parts = text.split(/\*([A-Za-z][A-Za-z'-]*)/g);
  return <>{parts.map((p, i) => (i % 2 ? <button key={i} type="button" className="ld-ref" onClick={() => onWord(p)}>{p}</button> : p))}</>;
}

/** The three files of the extraction, from a ZIP or picked one by one. */
async function datasetFiles(files: File[]): Promise<{ main?: File; senses?: File; cross?: File }> {
  const all: File[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      for (const e of await readZip(await f.arrayBuffer(), { files: 200, bytes: 400 * 1024 * 1024 })) {
        if (/\.jsonl$/i.test(e.path)) all.push(new File([e.data as BlobPart], e.path.split('/').pop()!, { type: 'application/jsonl' }));
      }
    } else all.push(f);
  }
  return {
    main: all.find((f) => f.name.includes('pronotes_import_v4')) ?? all.find((f) => f.name.includes('pronotes_import')),
    senses: all.find((f) => f.name.includes('dictionary_senses')),
    cross: all.find((f) => f.name.includes('cross_references_resolved')),
  };
}

interface Props {
  onClose: () => void;
  /** Puts text into the draft at the caret (the dictionary closes). */
  onInsert?: (text: string) => void;
  /** For a draft Bangla meaning. */
  gemini?: { key: string; model?: string };
}

export function LawDictionary({ onClose, onInsert, gemini }: Props) {
  const { lang } = useT();
  const L = (bn: string, en: string) => (lang === 'en' ? en : bn);
  const [tab, setTab] = useState<'law' | 'words'>('law');
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<DictionaryEntry[][]>([]);
  const [sel, setSel] = useState<DictionaryEntry[] | null>(null);
  const [senses, setSenses] = useState<DictionarySense[]>([]);
  const [equivalents, setEquivalents] = useState<DictionaryEquivalent[]>([]);
  const [linked, setLinked] = useState<DictionaryEntry[]>([]);
  const [count, setCount] = useState({ en: 0, bn: 0, words: 0 });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [newTerm, setNewTerm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [dups, setDups] = useState<DictionaryEntry[][] | null>(null);
  const lawFile = useRef<HTMLInputElement>(null);
  const wordFile = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const entry = sel?.[0] ?? null;

  const refreshCount = async () => {
    const [en, bn, words] = await Promise.all([countDictionaryEntries('en'), countDictionaryEntries('bn'), countWordList().catch(() => 0)]);
    setCount({ en, bn, words });
  };
  useEffect(() => { void refreshCount(); }, []);

  // search: Bangla letters look in the Bangla terms, anything else in the English ones
  useEffect(() => {
    let live = true;
    const q = query.trim();
    if (tab !== 'law' || !q) { setGroups([]); return; }
    void (isBangla(q) ? searchBanglaDictionary(q) : searchDictionary(q, 'en'))
      .then((r) => { if (live) setGroups(groupEntries(r)); })
      .catch(() => { if (live) setGroups([]); });
    return () => { live = false; };
  }, [query, tab, count]);

  const loadEntry = async (g: DictionaryEntry[]) => {
    const [s, e, l] = await Promise.all([
      Promise.all(g.map((x) => getDictionarySenses(x.id))).then((a) => a.flat()),
      Promise.all(g.map((x) => getDictionaryEquivalents(x.id))).then((a) => a.flat()),
      Promise.all(g.map((x) => getDictionaryLinkedEntries(x.id))).then((a) => a.flat()),
    ]);
    // the copies' meanings one after another, each copy's in its own order
    const order = new Map(g.map((x, i) => [x.id, i]));
    s.sort((a, b) => (order.get(a.entryId)! - order.get(b.entryId)!) || (a.senseNumber ?? 0) - (b.senseNumber ?? 0));
    setSenses(s); setEquivalents(e);
    setLinked([...new Map(l.filter((x) => !g.some((y) => y.id === x.id)).map((x) => [x.id, x])).values()]);
  };
  useEffect(() => { if (sel) void loadEntry(sel); else { setSenses([]); setEquivalents([]); setLinked([]); } setEditing(false); }, [sel]);
  const reload = () => sel && loadEntry(sel);

  const meanings = useMemo(() => equivalents.filter((x) => x.language === (entry?.language === 'bn' ? 'en' : 'bn')), [equivalents, entry]);
  const statusName = (s?: string) => (s === 'verified' ? L('যাচাইকৃত', 'verified') : s === 'reviewed' ? L('দেখা হয়েছে', 'reviewed') : L('খসড়া', 'draft'));
  const cardText = () => {
    if (!entry) return '';
    const m = meanings.map((x) => x.text).join(', ');
    return [entry.title + (entry.partOfSpeech ? ' (' + entry.partOfSpeech + ')' : ''), m, ...senses.map((s, i) => (senses.length > 1 ? i + 1 + '. ' : '') + reflow(s.definition))].filter(Boolean).join('\n');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(cardText()); setMessage(L('কপি হয়েছে', 'Copied')); } catch { setMessage(L('কপি করা গেল না', 'Could not copy')); } };
  // into the draft: "Bangla (English)" — the usual way to give a term in a legal draft
  const insert = () => {
    if (!entry || !onInsert) return;
    const bn = entry.language === 'en' ? meanings[0]?.text : entry.title;
    const en = entry.language === 'en' ? entry.title : meanings[0]?.text;
    onInsert(bn && en ? `${bn} (${en})` : entry.title);
  };

  // a draft Bangla meaning from Gemini, marked "draft" until you check it
  const draftMeaning = async () => {
    if (!entry || !gemini?.key) return;
    setDrafting(true);
    try {
      const prompt = [
        'নিচের ইংরেজি আইনি শব্দটার জন্য বাংলাদেশের আদালত ও দলিলে প্রচলিত বাংলা পরিভাষা দিন।',
        'শুধু ১ থেকে ৩টা বাংলা শব্দ বা শব্দগুচ্ছ, কমা দিয়ে আলাদা; কোনো ব্যাখ্যা, উদ্ধৃতিচিহ্ন বা ইংরেজি নয়। জানা না থাকলে কিছুই লিখবেন না।',
        '', 'শব্দ: ' + entry.title, 'সংজ্ঞা: ' + reflow(senses[0]?.definition ?? '').slice(0, 600),
      ].join('\n');
      const out = (await geminiGenerate(prompt, { key: gemini.key, model: gemini.model, temperature: 0 })).trim().replace(/^["“']|["”']$/g, '');
      if (!isBangla(out)) { setMessage(L('Gemini কোনো বাংলা অর্থ দিল না', 'Gemini gave no Bangla meaning')); return; }
      await addDictionaryTranslation(entry.id, out.split('\n')[0].slice(0, 120), L('Gemini-র খসড়া — যাচাই করুন', 'Gemini draft — check it'));
      await reload();
      setMessage(L('খসড়া অর্থ যোগ হয়েছে — যাচাই করে "দেখা হয়েছে" করুন', 'Draft meaning added — check it and mark it reviewed'));
    } catch (e) { setMessage(L('Gemini থেকে অর্থ আনা গেল না', 'Could not get a meaning from Gemini') + (e instanceof Error ? ': ' + e.message : '')); }
    finally { setDrafting(false); }
  };

  const importLaw = async (list: File[]) => {
    setMenu(false);
    if (!list.length) return;
    setBusy(true); setMessage(L('ফাইল পড়া হচ্ছে…', 'Reading the file…'));
    try {
      const f = await datasetFiles(list);
      if (!f.main) { setMessage(L('এতে pronotes_import_v4.jsonl নেই — Extraction v4 ZIP দিন', 'No pronotes_import_v4.jsonl in it — give the Extraction v4 ZIP')); return; }
      abort.current = new AbortController();
      const r = await importOxfordDictionaryJsonl(f.main, { sensesFile: f.senses, crossReferencesFile: f.cross, signal: abort.current.signal, onProgress: (p) => setProgress({ processed: p.processed, total: p.total }) });
      setMessage(L(`${r.imported}টা নতুন শব্দ, ${r.sensesImported}টা অর্থ, ${r.relationsImported}টা সম্পর্ক এসেছে; ${r.skipped}টা আগে থেকেই ছিল বা বাদ${r.cancelled ? ' — মাঝপথে থামানো হয়েছে' : ''}।`,
        `${r.imported} new words, ${r.sensesImported} meanings, ${r.relationsImported} links added; ${r.skipped} already there or skipped${r.cancelled ? ' — stopped part way' : ''}.`));
      await refreshCount();
    } catch (e) { setMessage(L('ইমপোর্ট হলো না', 'Import failed') + (e instanceof Error ? ': ' + e.message : '')); }
    finally { setBusy(false); setProgress(null); }
  };
  const importWords = async (file?: File) => {
    setMenu(false);
    if (!file) return;
    try {
      const n = await importWordList(await file.text());
      setMessage(L(`Oxford শব্দতালিকা: ${num(n, 'bn')}টা শব্দ এসেছে`, `Oxford word list: ${n} words added`));
      await refreshCount(); setTab('words');
    } catch { setMessage(L('এটা ProNotes-এর Oxford শব্দতালিকার ফাইল নয় (oxford-3000-5000.json)', 'This is not the ProNotes Oxford word-list file (oxford-3000-5000.json)')); }
  };
  const audit = async () => { setMenu(false); setDups(await findDictionaryDuplicateGroups()); };

  const back = () => (sel ? setSel(null) : onClose());
  return (
    <main className={'lawdict' + (sel ? ' has-sel' : '')} data-testid="law-dictionary">
      <header className="ld-bar">
        <button type="button" className="ld-back" data-testid="dict-back" onClick={back} aria-label={L('ফিরুন', 'Back')}>‹</button>
        <strong className="ld-title">{L('ডিকশনারি', 'Dictionary')}</strong>
        <div className="ld-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'law'} data-testid="dict-tab-law" onClick={() => { setTab('law'); setSel(null); }}>{L('আইন', 'Law')}</button>
          <button type="button" role="tab" aria-selected={tab === 'words'} data-testid="dict-tab-words" onClick={() => { setTab('words'); setSel(null); }}>Oxford 5000</button>
        </div>
        <span className="ld-sp" />
        <button type="button" className="ld-more" data-testid="dict-menu" aria-expanded={menu} aria-label={L('আরও', 'More')} onClick={() => setMenu((m) => !m)}>⋯</button>
        <button type="button" className="btn small" data-testid="dict-close" onClick={onClose}>{L('ড্রাফটে ফিরুন', 'Back to drafts')}</button>
        {menu && (
          <div className="ld-menu" role="menu" data-testid="dict-menu-list">
            <button type="button" role="menuitem" data-testid="dict-import" onClick={() => lawFile.current?.click()}>{L('আইনের ডেটা ইমপোর্ট (ZIP)', 'Import law data (ZIP)')}</button>
            <button type="button" role="menuitem" data-testid="dict-import-words" onClick={() => wordFile.current?.click()}>{L('Oxford 3000/5000 ইমপোর্ট', 'Import Oxford 3000/5000')}</button>
            <button type="button" role="menuitem" data-testid="dict-new-term" onClick={() => { setMenu(false); setNewTerm(true); setTab('law'); setSel(null); }}>{L('নতুন বাংলা শব্দ', 'New Bangla term')}</button>
            <button type="button" role="menuitem" data-testid="dict-audit" onClick={() => void audit()}>{L('একই শব্দ একাধিকবার আছে কি না', 'Words that appear more than once')}</button>
          </div>
        )}
        <input ref={lawFile} type="file" hidden multiple accept=".zip,.jsonl,application/zip" data-testid="dict-import-file" onChange={(e) => { void importLaw([...(e.target.files ?? [])]); e.currentTarget.value = ''; }} />
        <input ref={wordFile} type="file" hidden accept=".json,application/json" data-testid="dict-import-words-file" onChange={(e) => { void importWords(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </header>

      {message && <p className="ld-msg" role="status" data-testid="dict-msg" onClick={() => setMessage('')}>{message}</p>}
      {busy && (
        <div className="ld-progress">
          <progress max={progress?.total ?? 1} value={progress?.processed ?? 0} />
          <button type="button" className="btn small" onClick={() => abort.current?.abort()}>{L('থামান', 'Stop')}</button>
        </div>
      )}
      {newTerm && <NewTerm L={L} onDone={async (e) => { setNewTerm(false); if (e) { setQuery(e.title); setSel([e]); await refreshCount(); } }} />}
      {dups && (
        <div className="ld-dups" data-testid="dict-dups">
          <strong>{L(`${num(dups.length, 'bn')}টা শব্দ একাধিকবার আছে`, `${dups.length} words appear more than once`)}</strong>
          <p>{L('সার্চে এগুলো একটাই শব্দ হিসেবে দেখায়, ভেতরে অর্থ ১, ২ করে। কিছু মোছা হয়নি।', 'In search each shows as one word, with meanings 1, 2… Nothing was deleted.')}</p>
          <button type="button" className="btn small" onClick={() => setDups(null)}>{L('ঠিক আছে', 'OK')}</button>
        </div>
      )}

      {tab === 'words' ? <WordLists L={L} count={count.words} onImport={() => wordFile.current?.click()} /> : (
        <div className="ld-body">
          <section className="ld-list">
            <label className="ld-search">
              <span aria-hidden="true">⌕</span>
              <input data-testid="dict-search" value={query} onChange={(e) => { setQuery(e.target.value); setSel(null); }} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                placeholder={L('শব্দ লিখুন — English বা বাংলা', 'Type a word — English or Bangla')} aria-label={L('শব্দ খুঁজুন', 'Search a word')} />
            </label>
            <small className="ld-count">{L(`${count.en.toLocaleString('bn-BD')}টা English · ${count.bn.toLocaleString('bn-BD')}টা বাংলা শব্দ`, `${count.en.toLocaleString()} English · ${count.bn.toLocaleString()} Bangla words`)}</small>
            {!count.en && !count.bn ? (
              <div className="ld-empty" data-testid="dict-empty">
                <strong>{L('ডিকশনারি এখনো খালি', 'The dictionary is empty')}</strong>
                <p>{L('আপনার Drive-এ রাখা Extraction v4 ZIP ফাইলটা দিন। ডেটা শুধু এই ডিভাইসে থাকে।', 'Give the Extraction v4 ZIP from your Drive. The data stays on this device only.')}</p>
                <button type="button" className="btn primary" onClick={() => lawFile.current?.click()}>{L('ZIP ফাইল বাছুন', 'Choose the ZIP file')}</button>
              </div>
            ) : (
              <ul className="ld-results" data-testid="dict-results">
                {groups.map((g) => (
                  <li key={g[0].id}>
                    <button type="button" className={sel?.[0].id === g[0].id ? 'on' : ''} data-testid={'dict-hit-' + g[0].normalizedTitle} onClick={() => setSel(g)}>
                      <strong>{g[0].title}</strong>
                      <small>{[g[0].partOfSpeech, g.length > 1 ? L(`${num(g.length, 'bn')}টা অর্থের দল`, `${g.length} groups of meanings`) : ''].filter(Boolean).join(' · ')}</small>
                    </button>
                  </li>
                ))}
                {query.trim() && !groups.length && <li className="ld-none">{L('এই শব্দ পাওয়া গেল না', 'No such word')}</li>}
              </ul>
            )}
          </section>

          <section className="ld-card" data-testid="dict-card">
            {!entry ? <p className="ld-hint">{L('বাঁয়ে একটা শব্দ বাছুন।', 'Pick a word on the left.')}</p> : (
              <>
                <h2 data-testid="dict-word">{entry.title}{entry.partOfSpeech && <small> {entry.partOfSpeech}</small>}</h2>
                <div className="ld-meanings" data-testid="dict-meanings">
                  {meanings.map((m) => <span key={m.id} className={'ld-chip ' + (m.reviewStatus ?? 'draft')} title={statusName(m.reviewStatus)}>{m.text}<small>{statusName(m.reviewStatus)}</small></span>)}
                  {!meanings.length && <span className="ld-muted">{entry.language === 'en' ? L('বাংলা অর্থ এখনো নেই', 'No Bangla meaning yet') : L('English প্রতিশব্দ এখনো নেই', 'No English equivalent yet')}</span>}
                </div>
                <div className="ld-actions">
                  <button type="button" className="btn small" data-testid="dict-copy" onClick={() => void copy()}>{L('কপি', 'Copy')}</button>
                  {onInsert && <button type="button" className="btn small" data-testid="dict-insert" onClick={insert}>{L('ড্রাফটে বসান', 'Put in the draft')}</button>}
                  {entry.language === 'en' && gemini?.key && <button type="button" className="btn small" data-testid="dict-draft" disabled={drafting} onClick={() => void draftMeaning()}>{drafting ? L('আনছে…', 'Getting…') : L('বাংলা অর্থের খসড়া', 'Draft Bangla meaning')}</button>}
                  <button type="button" className={'btn small' + (editing ? ' primary' : '')} data-testid="dict-edit" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>✎ {L('এডিট', 'Edit')}</button>
                </div>
                <ol className="ld-senses" data-testid="dict-senses">
                  {senses.map((s) => <li key={s.id}><Marked text={withoutHead(reflow(s.definition), entry.title)} onWord={(w) => { setQuery(w); setSel(null); }} />{s.subject && <small> · {s.subject}</small>}</li>)}
                </ol>
                {linked.length > 0 && (
                  <div className="ld-related">
                    <small>{L('সম্পর্কিত', 'Related')}</small>
                    {linked.map((x) => <button key={x.id} type="button" className="ld-chip link" onClick={() => { setQuery(x.title); setSel([x]); }}>{x.title}</button>)}
                  </div>
                )}
                {editing && <EditPanel L={L} entry={entry} senses={senses} meanings={meanings} onChanged={() => void reload()} onLinked={(x) => { setQuery(x.title); setSel([x]); }} say={setMessage} />}
                <p className="ld-source">{entry.sourceId
                  ? L('উৎস: A Dictionary of Law (Oxford University Press, ৫ম সংস্করণ, ২০০২), যুক্তরাজ্যের আইনভিত্তিক — বাংলাদেশের আইন হিসেবে ধরে নেবেন না।', 'Source: A Dictionary of Law (Oxford University Press, 5th ed., 2002), based on UK law — do not take it as Bangladesh law.')
                  : L('আপনার নিজের যোগ করা শব্দ।', 'A word you added yourself.')}</p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

type Lx = (bn: string, en: string) => string;

function NewTerm({ L, onDone }: { L: Lx; onDone: (e?: DictionaryEntry) => void }) {
  const [w, setW] = useState('');
  const [d, setD] = useState('');
  const [err, setErr] = useState('');
  const save = async () => { try { onDone(await createBanglaDictionaryEntry(w, d)); } catch (e) { setErr(e instanceof Error ? e.message : L('যোগ করা গেল না', 'Could not add it')); } };
  return (
    <div className="ld-form" data-testid="dict-new-form">
      <input data-testid="dict-new-word" value={w} onChange={(e) => setW(e.target.value)} placeholder={L('বাংলা শব্দ', 'Bangla term')} aria-label={L('বাংলা শব্দ', 'Bangla term')} />
      <textarea data-testid="dict-new-def" value={d} onChange={(e) => setD(e.target.value)} placeholder={L('ব্যাখ্যা (ইচ্ছা হলে)', 'Explanation (optional)')} aria-label={L('ব্যাখ্যা', 'Explanation')} />
      {err && <p className="ld-err">{err}</p>}
      <div className="ld-actions">
        <button type="button" className="btn small primary" data-testid="dict-new-save" disabled={!w.trim()} onClick={() => void save()}>{L('যোগ করুন', 'Add')}</button>
        <button type="button" className="btn small" onClick={() => onDone()}>{L('বাতিল', 'Cancel')}</button>
      </div>
    </div>
  );
}

/** ✎: meanings, review marks, extra senses and links — shown only while editing. */
function EditPanel({ L, entry, senses, meanings, onChanged, onLinked, say }: { L: Lx; entry: DictionaryEntry; senses: DictionarySense[]; meanings: DictionaryEquivalent[]; onChanged: () => void; onLinked: (e: DictionaryEntry) => void; say: (s: string) => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [senseId, setSenseId] = useState('');
  const [newSense, setNewSense] = useState('');
  const [editSense, setEditSense] = useState<{ id: string; text: string } | null>(null);
  const [editMean, setEditMean] = useState<{ id: string; text: string } | null>(null);
  const [linkQ, setLinkQ] = useState('');
  const [linkHits, setLinkHits] = useState<DictionaryEntry[]>([]);
  const [rel, setRel] = useState<'related' | 'see' | 'see_also' | 'compare'>('related');
  const other = entry.language === 'en' ? 'bn' : 'en';
  useEffect(() => {
    let live = true;
    if (!linkQ.trim()) { setLinkHits([]); return; }
    void searchDictionary(linkQ, other, 20).then((r) => { if (live) setLinkHits(r.filter((x) => x.id !== entry.id)); });
    return () => { live = false; };
  }, [linkQ, entry.id, other]);
  const run = async (f: () => Promise<unknown>, ok: string) => { try { await f(); onChanged(); say(ok); } catch (e) { say(e instanceof Error ? e.message : L('হলো না', 'Did not work')); } };
  const verify = async (id: string) => {
    const reviewer = window.prompt(L('কে যাচাই করলেন?', 'Who checked it?')); if (!reviewer?.trim()) return;
    const authority = window.prompt(L('কোন আইন, রায় বা নির্ভরযোগ্য উৎস দেখে?', 'Against which law, judgment or reliable source?')); if (!authority?.trim()) return;
    const n = window.prompt(L('সংক্ষেপে কারণ:', 'Short reason:')); if (!n?.trim()) return;
    await run(() => setDictionaryEquivalentReviewStatus(id, 'verified', { reviewer, authority, note: n }), L('যাচাইকৃত চিহ্ন দেওয়া হলো', 'Marked verified'));
  };
  return (
    <div className="ld-edit" data-testid="dict-edit-panel">
      <h3>{entry.language === 'en' ? L('বাংলা অর্থ', 'Bangla meanings') : L('English প্রতিশব্দ', 'English equivalents')}</h3>
      {meanings.map((m) => (
        <div key={m.id} className="ld-row">
          {editMean?.id === m.id ? (
            <>
              <input value={editMean.text} onChange={(e) => setEditMean({ id: m.id, text: e.target.value })} aria-label={L('অর্থ', 'Meaning')} />
              <button type="button" className="btn small primary" onClick={() => void run(async () => { await updateDictionaryEquivalent(m.id, editMean.text); setEditMean(null); }, L('বদলানো হলো', 'Changed'))}>{L('রাখুন', 'Save')}</button>
            </>
          ) : (
            <>
              <span className="ld-row-text">{m.text}{m.note && <small> · {m.note}</small>}</span>
              <button type="button" className="btn small" onClick={() => setEditMean({ id: m.id, text: m.text })}>✎</button>
              <button type="button" className="btn small" onClick={() => void run(() => setDictionaryEquivalentReviewStatus(m.id, m.reviewStatus === 'reviewed' ? 'draft' : 'reviewed'), L('চিহ্ন বদলানো হলো', 'Mark changed'))}>{m.reviewStatus === 'reviewed' ? L('খসড়া করুন', 'Make draft') : L('দেখা হয়েছে', 'Reviewed')}</button>
              <button type="button" className="btn small" onClick={() => void verify(m.id)}>{L('যাচাইকৃত', 'Verified')}</button>
              <button type="button" className="btn small" onClick={() => { if (window.confirm(L('এই অর্থ মুছবেন?', 'Delete this meaning?'))) void run(() => deleteDictionaryEquivalent(m.id), L('মোছা হলো', 'Deleted')); }}>{L('মুছুন', 'Delete')}</button>
            </>
          )}
        </div>
      ))}
      <div className="ld-row">
        {entry.language === 'en' && senses.length > 1 && (
          <select value={senseId} onChange={(e) => setSenseId(e.target.value)} aria-label={L('কোন অর্থের জন্য', 'For which meaning')}>
            <option value="">{L('সব অর্থের জন্য', 'For all meanings')}</option>
            {senses.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {reflow(s.definition).slice(0, 60)}</option>)}
          </select>
        )}
        <input data-testid="dict-add-meaning" value={text} onChange={(e) => setText(e.target.value)} placeholder={entry.language === 'en' ? L('বাংলা অর্থ', 'Bangla meaning') : L('English প্রতিশব্দ', 'English equivalent')} aria-label={L('নতুন অর্থ', 'New meaning')} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('প্রসঙ্গ (ইচ্ছা হলে)', 'Context (optional)')} aria-label={L('প্রসঙ্গ', 'Context')} />
        <button type="button" className="btn small primary" data-testid="dict-add-meaning-save" disabled={!text.trim()} onClick={() => void run(async () => {
          if (entry.language === 'en') await addDictionaryTranslation(entry.id, text, note, senseId || undefined); else await addDictionaryEquivalent(entry.id, text, 'en', note);
          setText(''); setNote(''); setSenseId('');
        }, L('অর্থ যোগ হলো', 'Meaning added'))}>{L('যোগ', 'Add')}</button>
      </div>

      <h3>{L('অর্থ / সংজ্ঞা', 'Senses')}</h3>
      {senses.map((s, i) => (
        <div key={s.id} className="ld-row">
          {editSense?.id === s.id ? (
            <>
              <textarea value={editSense.text} onChange={(e) => setEditSense({ id: s.id, text: e.target.value })} aria-label={L('সংজ্ঞা', 'Sense')} />
              <button type="button" className="btn small primary" onClick={() => void run(async () => { await updateDictionarySense(s.id, editSense.text, s.subject); setEditSense(null); }, L('বদলানো হলো', 'Changed'))}>{L('রাখুন', 'Save')}</button>
            </>
          ) : (
            <>
              <span className="ld-row-text">{i + 1}. {reflow(s.definition).slice(0, 140)}{reflow(s.definition).length > 140 ? '…' : ''}</span>
              <button type="button" className="btn small" onClick={() => setEditSense({ id: s.id, text: reflow(s.definition) })}>✎</button>
              <button type="button" className="btn small" onClick={() => { if (window.confirm(L('এই অর্থ আর এর সাথে যুক্ত বাংলা অর্থ মুছবেন?', 'Delete this sense and the meanings tied to it?'))) void run(() => deleteDictionarySense(s.id), L('মোছা হলো', 'Deleted')); }}>{L('মুছুন', 'Delete')}</button>
            </>
          )}
        </div>
      ))}
      <div className="ld-row">
        <input value={newSense} onChange={(e) => setNewSense(e.target.value)} placeholder={L('নতুন অর্থ বা আইনি প্রসঙ্গ', 'New sense or legal context')} aria-label={L('নতুন অর্থ', 'New sense')} />
        <button type="button" className="btn small" disabled={!newSense.trim()} onClick={() => void run(async () => { await addDictionarySense(entry.id, newSense); setNewSense(''); }, L('যোগ হলো', 'Added'))}>{L('যোগ', 'Add')}</button>
      </div>

      <h3>{L('সম্পর্কিত শব্দ জুড়ুন', 'Link a related word')}</h3>
      <div className="ld-row">
        <select value={rel} onChange={(e) => setRel(e.target.value as typeof rel)} aria-label={L('সম্পর্ক', 'Relation')}>
          <option value="related">{L('সম্পর্কিত', 'Related')}</option><option value="see">{L('দেখুন', 'See')}</option><option value="see_also">{L('আরও দেখুন', 'See also')}</option><option value="compare">{L('তুলনা করুন', 'Compare')}</option>
        </select>
        <input value={linkQ} onChange={(e) => setLinkQ(e.target.value)} placeholder={other === 'bn' ? L('বাংলা শব্দ খুঁজুন', 'Find a Bangla word') : L('English শব্দ খুঁজুন', 'Find an English word')} aria-label={L('শব্দ খুঁজুন', 'Find a word')} />
      </div>
      {linkHits.map((x) => <button key={x.id} type="button" className="ld-chip link" onClick={() => void run(async () => { await linkDictionaryEquivalent(entry.id, x.id, rel); setLinkQ(''); }, L('জোড়া হলো', 'Linked')).then(() => onLinked(entry))}>{x.title} +</button>)}
    </div>
  );
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
/** The Oxford 3000 / 5000 learner lists: search, a level at a time. Separate from the law data. */
function WordLists({ L, count, onImport }: { L: Lx; count: number; onImport: () => void }) {
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState('');
  const [hits, setHits] = useState<WordListItem[]>([]);
  useEffect(() => {
    let live = true;
    void searchWordList(q, lvl).then((r) => { if (live) setHits(r); }).catch(() => setHits([]));
    return () => { live = false; };
  }, [q, lvl, count]);
  if (!count) return (
    <div className="ld-empty" data-testid="words-empty">
      <strong>{L('Oxford 3000 / 5000 এখনো আনা হয়নি', 'Oxford 3000 / 5000 not added yet')}</strong>
      <p>{L('আপনার Drive-এ রাখা oxford-3000-5000.json ফাইলটা দিন। এটা আইনের ডিকশনারি থেকে আলাদা থাকে।', 'Give the oxford-3000-5000.json file from your Drive. It stays apart from the law dictionary.')}</p>
      <button type="button" className="btn primary" onClick={onImport}>{L('ফাইল বাছুন', 'Choose the file')}</button>
    </div>
  );
  return (
    <div className="ld-words" data-testid="words">
      <label className="ld-search"><span aria-hidden="true">⌕</span>
        <input data-testid="words-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ইংরেজি শব্দ লিখুন', 'Type an English word')} aria-label={L('শব্দ খুঁজুন', 'Search a word')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <div className="ld-levels" role="radiogroup">
        {['', ...LEVELS].map((x) => <button key={x || 'all'} type="button" role="radio" aria-checked={lvl === x} data-testid={'words-lvl-' + (x || 'all')} onClick={() => setLvl(x)}>{x || L('সব', 'All')}</button>)}
      </div>
      <ul className="ld-wordlist" data-testid="words-list">
        {hits.map((w) => <li key={w.id}><strong>{w.w}</strong><span>{w.pos}</span><b className={'lvl ' + w.lvl}>{w.lvl}</b><small>{w.list === '3000' ? 'Oxford 3000' : 'Oxford 5000'}</small></li>)}
        {!hits.length && <li className="ld-none">{L('কিছু পাওয়া গেল না', 'Nothing found')}</li>}
      </ul>
    </div>
  );
}
