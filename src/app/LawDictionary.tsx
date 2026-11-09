import { useEffect, useMemo, useState } from 'react';
import { addDictionaryEquivalent, addDictionarySense, updateDictionarySense, deleteDictionarySense, addDictionaryTranslation, setDictionaryEquivalentReviewStatus, updateDictionaryEquivalent, deleteDictionaryEquivalent, findDictionaryDuplicateGroups, createBanglaDictionaryEntry, getDictionaryLinkedEntries, linkDictionaryEquivalent, searchBanglaDictionary, countDictionaryEntries, getDictionaryEquivalents, getDictionarySenses, importOxfordDictionaryJsonl, searchDictionary, type DictionaryEntry, type DictionaryEquivalent, type DictionarySense } from '../storage';

export function LawDictionary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'en' | 'bn'>('en');
  const [newHeadword, setNewHeadword] = useState('');
  const [newDefinition, setNewDefinition] = useState('');
  const [linked, setLinked] = useState<DictionaryEntry[]>([]);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [selected, setSelected] = useState<DictionaryEntry | null>(null);
  const [senses, setSenses] = useState<DictionarySense[]>([]);
  const [equivalents, setEquivalents] = useState<DictionaryEquivalent[]>([]);
  const [translation, setTranslation] = useState('');
  const [translationSenseId, setTranslationSenseId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [count, setCount] = useState(0);
  const [banglaCount, setBanglaCount] = useState(0);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<DictionaryEntry[]>([]);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number; imported: number; skipped: number } | null>(null);
  const [senseText, setSenseText] = useState('');
  const [senseSubject, setSenseSubject] = useState('');
  const [editingSense, setEditingSense] = useState<string | null>(null);
  const [editSenseText, setEditSenseText] = useState('');
  const [editSenseSubject, setEditSenseSubject] = useState('');
  const [duplicateGroups, setDuplicateGroups] = useState<DictionaryEntry[][]>([]);
  const [editingEquivalent, setEditingEquivalent] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [relationType, setRelationType] = useState<'related' | 'see' | 'see_also' | 'compare'>('related');

  const refreshCount = async () => { const [en, bn] = await Promise.all([countDictionaryEntries('en'), countDictionaryEntries('bn')]); setCount(en); setBanglaCount(bn); };
  useEffect(() => { void refreshCount(); }, []);
  useEffect(() => {
    let live = true;
    const run = async () => { if (!query.trim()) { setEntries([]); return; } try { const result = await (direction === 'en' ? searchDictionary(query, 'en') : searchBanglaDictionary(query)); if (live) setEntries(result); } catch (error) { if (live) { setEntries([]); setMessage(error instanceof Error ? `Search ব্যর্থ: ${error.message}` : 'Search ব্যর্থ হয়েছে।'); } } };
    void run(); return () => { live = false; };
  }, [query, count, direction]);
  useEffect(() => {
    let live = true;
    if (!selected) { setSenses([]); setEquivalents([]); setLinked([]); return; }
    void Promise.all([getDictionarySenses(selected.id), getDictionaryEquivalents(selected.id), getDictionaryLinkedEntries(selected.id)]).then(([s, e, l]) => { if (live) { setSenses(s); setEquivalents(e); setLinked(l); } }).catch((error) => { if (live) setMessage(error instanceof Error ? `Entry load ব্যর্থ: ${error.message}` : 'Entry load ব্যর্থ হয়েছে।'); });
    return () => { live = false; };
  }, [selected]);
  useEffect(() => { let live = true; const run = async () => { if (!selected || !linkQuery.trim()) { setLinkResults([]); return; } const results = selected.language === 'en' ? await searchDictionary(linkQuery, 'bn', 20) : await searchDictionary(linkQuery, 'en', 20); if (live) setLinkResults(results.filter((item) => item.id !== selected.id)); }; void run(); return () => { live = false; }; }, [selected, linkQuery]);
  const bnTranslations = useMemo(() => equivalents.filter((item) => item.language === (selected?.language === 'bn' ? 'en' : 'bn')), [equivalents, selected]);

  const importFile = async (files?: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const main = selectedFiles.find((f) => f.name.includes('pronotes_import_v4')) ?? selectedFiles.find((f) => f.name.includes('pronotes_import')) ?? selectedFiles.find((f) => !/sense|cross.?reference/i.test(f.name));
    if (!main) { setMessage('মূল pronotes_import_v4.jsonl ফাইলটি নির্বাচন করুন।'); return; }
    const sensesFile = selectedFiles.find((f) => f.name.includes('dictionary_senses_v3'));
    const crossReferencesFile = selectedFiles.find((f) => f.name.includes('cross_references_resolved_v4'));
    const missing = [!sensesFile && 'dictionary_senses_v3.jsonl', !crossReferencesFile && 'cross_references_resolved_v4.jsonl'].filter(Boolean);
    if (missing.length) { setMessage(`অসম্পূর্ণ dataset নির্বাচন: ${missing.join(' এবং ')} ফাইলও নির্বাচন করুন। কোনো import শুরু হয়নি।`); return; }
    if (new Set(selectedFiles.map((file) => file.name)).size !== selectedFiles.length) { setMessage('একই নামের একাধিক ফাইল নির্বাচন করা হয়েছে। সঠিক তিনটি JSONL ফাইল নির্বাচন করুন।'); return; }
    setImportProgress(null);
    setBusy(true); setMessage('Oxford entries, পৃথক senses ও cross-references import হচ্ছে…');
    try { const controller = new AbortController(); (window as Window & { __lawDictionaryImportAbort?: AbortController }).__lawDictionaryImportAbort = controller; const result = await importOxfordDictionaryJsonl(main, { sensesFile, crossReferencesFile, signal: controller.signal, onProgress: setImportProgress }); setMessage(`${result.imported}টি নতুন entry, ${result.sensesImported}টি sense এবং ${result.relationsImported}টি verified-match cross-reference import হয়েছে; ${result.skipped}টি entry বাদ; ${result.unresolvedRelations}টি unresolved/ambiguous reference link করা হয়নি${result.cancelled ? '; import বাতিল করা হয়েছে' : ''}।`); await refreshCount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Import ব্যর্থ হয়েছে।'); }
    finally { setBusy(false); }
  };
  const saveLink = async (target: DictionaryEntry) => { if (!selected) return; try { await linkDictionaryEquivalent(selected.id, target.id, relationType); setLinked(await getDictionaryLinkedEntries(selected.id)); setLinkQuery(''); setMessage('শব্দের সম্পর্ক সংরক্ষিত হয়েছে।'); } catch (error) { setMessage(error instanceof Error ? error.message : 'সম্পর্ক যোগ করা যায়নি।'); } };

  const saveTranslation = async () => {
    if (!selected || !translation.trim()) return;
    try {
      if (selected.language === 'en') await addDictionaryTranslation(selected.id, translation, note, translationSenseId || undefined);
      else await addDictionaryEquivalent(selected.id, translation, 'en', note);
      setTranslation(''); setNote(''); setTranslationSenseId(''); setEquivalents(await getDictionaryEquivalents(selected.id)); setMessage('অনুবাদ সংরক্ষিত হয়েছে।');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'অনুবাদ সংরক্ষণ করা যায়নি।'); }
  };
  const changeReviewStatus = async (id: string, status: 'draft' | 'reviewed' | 'verified') => {
    let evidence: { note: string; reviewer: string; authority: string } | undefined;
    if (status === 'verified') {
      const reviewer = window.prompt('যাচাইকারীর নাম/পরিচয় লিখুন:'); if (!reviewer?.trim()) return;
      const authority = window.prompt('যে আইন, রায়, সরকারি উৎস বা নির্ভরযোগ্য reference দেখে যাচাই করেছেন তা লিখুন:'); if (!authority?.trim()) return;
      const note = window.prompt('যাচাইয়ের সংক্ষিপ্ত কারণ/নোট লিখুন:'); if (!note?.trim()) return;
      evidence = { reviewer, authority, note };
    }
    try { await setDictionaryEquivalentReviewStatus(id, status, evidence); setEquivalents(await getDictionaryEquivalents(selected!.id)); setMessage('অনুবাদের review status আপডেট হয়েছে।'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Review status আপডেট করা যায়নি।'); }
  };

  const saveSense = async () => { if (!selected || !senseText.trim()) return; await addDictionarySense(selected.id, senseText, senseSubject); setSenseText(''); setSenseSubject(''); setSenses(await getDictionarySenses(selected.id)); setMessage('নতুন sense সংরক্ষিত হয়েছে।'); };
  const saveSenseEdit = async (id: string) => { await updateDictionarySense(id, editSenseText, editSenseSubject); setEditingSense(null); setSenses(await getDictionarySenses(selected!.id)); setMessage('Sense সংশোধন হয়েছে।'); };
  const removeSense = async (id: string) => { if (!window.confirm('এই sense এবং এর সঙ্গে যুক্ত sense-specific অনুবাদ মুছে ফেলবেন? সাধারণ অনুবাদ অক্ষত থাকবে।')) return; await deleteDictionarySense(id); setSenses(await getDictionarySenses(selected!.id)); setEquivalents(await getDictionaryEquivalents(selected!.id)); setMessage('Sense এবং সংশ্লিষ্ট অনুবাদ মুছে ফেলা হয়েছে।'); };
  const inspectDuplicates = async () => { const groups = await findDictionaryDuplicateGroups(); setDuplicateGroups(groups); setMessage(`${groups.length}টি সম্ভাব্য duplicate headword group পাওয়া গেছে। কোনো record merge বা delete করা হয়নি।`); };
  const saveEquivalentEdit = async (id: string) => { await updateDictionaryEquivalent(id, editText); setEditingEquivalent(null); setEquivalents(await getDictionaryEquivalents(selected!.id)); setMessage('অনুবাদ সংশোধন হয়েছে।'); };
  const removeEquivalent = async (id: string) => { if (!window.confirm('এই অনুবাদটি মুছে ফেলবেন?')) return; await deleteDictionaryEquivalent(id); setEquivalents(await getDictionaryEquivalents(selected!.id)); setMessage('অনুবাদ মুছে ফেলা হয়েছে।'); };

  const createHeadword = async () => {
    try { const entry = await createBanglaDictionaryEntry(newHeadword, newDefinition); setDirection('bn'); setQuery(entry.title); setSelected(entry); setNewHeadword(''); setNewDefinition(''); setMessage('বাংলা headword যোগ হয়েছে।'); await refreshCount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Headword যোগ করা যায়নি'); }
  };

  return <main className="lawdict" data-testid="law-dictionary">
    <div className="lawdict-head"><div><p className="lawdict-kicker">PRONOTES KNOWLEDGE</p><h1>ProNotes Law Dictionary</h1><p>English ↔ বাংলা · Offline legal terminology</p></div><button className="btn" onClick={onClose}>ডকুমেন্টে ফিরুন</button></div>
    <div className="lawdict-toolbar"><label htmlFor="lawdict-direction">Search language</label><select id="lawdict-direction" aria-label="Dictionary search language" value={direction} onChange={(e) => { setDirection(e.target.value as 'en' | 'bn'); setSelected(null); setEntries([]); }}><option value="en">English → বাংলা</option><option value="bn">বাংলা → English</option></select><label className="lawdict-search"><span>⌕</span><input aria-label="Search legal term" placeholder={direction === 'en' ? 'Search an English legal term…' : 'বাংলা আইনগত শব্দ খুঁজুন…'} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }}/></label><span className="lawdict-count">{(direction === 'en' ? count : banglaCount).toLocaleString()} headwords</span></div>
    {message && <p className="lawdict-message" role="status">{message}</p>}
    <div className="lawdict-layout">
      <section className="lawdict-results" aria-label="Search results">
        {!query.trim() && <div className="lawdict-empty"><strong>আইনগত শব্দ খুঁজুন</strong><p>English বা বাংলা headword লিখুন। প্রতিটি শব্দের সংজ্ঞা ও বাংলা অনুবাদ এখানে দেখা যাবে।</p></div>}
        {query.trim() && entries.length === 0 && <div className="lawdict-empty">কোনো matching entry পাওয়া যায়নি। প্রথমে Oxford JSONL dataset import করুন।</div>}
        {entries.map((entry) => <button key={entry.id} className={'lawdict-result' + (selected?.id === entry.id ? ' active' : '')} onClick={() => setSelected(entry)}><strong>{entry.title}</strong><small>{entry.partOfSpeech || 'Legal term'} · PDF p. {entry.sourcePages?.join('–') || '—'}</small></button>)}
      </section>
      <section className="lawdict-detail">
        {!selected ? <div className="lawdict-empty">একটি headword নির্বাচন করলে তার definition ও বাংলা অর্থ এখানে দেখাবে।</div> : <>
          <div className="lawdict-term"><div><small>{selected.language === 'en' ? 'ENGLISH HEADWORD' : 'বাংলা HEADWORD'}</small><h2>{selected.title}</h2><span>{selected.partOfSpeech || 'Part of speech not confirmed'} · {selected.jurisdiction || 'Source jurisdiction not specified'}</span></div><span className="lawdict-status">{selected.verificationStatus === 'machine_unverified' ? 'Machine extracted · Unverified' : 'User-authored · Not legally verified'}</span></div>
          <h3>{selected.language === 'bn' ? 'বাংলা ব্যাখ্যা' : 'English definition'}</h3>
          {senses.map((sense) => <article className="lawdict-definition" key={sense.id}>{editingSense === sense.id ? <div className="lawdict-add"><textarea aria-label="Edit sense definition" value={editSenseText} onChange={(e) => setEditSenseText(e.target.value)} /><input aria-label="Edit sense subject" value={editSenseSubject} onChange={(e) => setEditSenseSubject(e.target.value)} placeholder="Subject / legal context"/><button className="btn primary" onClick={() => void saveSenseEdit(sense.id)}>Save sense</button><button className="btn" onClick={() => setEditingSense(null)}>Cancel</button></div> : <>{sense.definition}<small>{sense.subject || 'Subject not classified'} · Source PDF page(s): {(sense.sourcePages?.length ? sense.sourcePages.join('–') : sense.sourcePage) ?? 'not recorded'} · {sense.verificationStatus === 'machine_unverified' ? 'Machine extracted · Unverified' : 'User-added · Not legally verified'}</small><div className="lawdict-actions"><button className="btn" onClick={() => { setEditingSense(sense.id); setEditSenseText(sense.definition); setEditSenseSubject(sense.subject || ''); }}>Edit sense</button><button className="btn" onClick={() => void removeSense(sense.id)}>Delete sense</button></div></>}</article>)}
          <h3>{selected.language === 'bn' ? 'English equivalents' : 'বাংলা অর্থ / অনুবাদ'}</h3>
          {bnTranslations.length ? bnTranslations.map((item) => { const sense = senses.find((candidate) => candidate.id === item.senseId); return <div className="lawdict-translation" key={item.id}><strong>{item.text}</strong><small>{sense ? `Sense ${sense.senseNumber ?? ''}: ${sense.subject || sense.definition.slice(0, 110)}` : 'সাধারণ / নির্দিষ্ট sense-এ সীমাবদ্ধ নয়'} · Review: {item.reviewStatus || 'legacy / not set'}</small>{item.note && <p>{item.note}</p>}{item.verificationEvidence && <small>Verified by {item.verificationEvidence.reviewer} · Authority: {item.verificationEvidence.authority} · {item.verificationEvidence.note}</small>}{editingEquivalent === item.id ? <div className="lawdict-add"><input aria-label="Edit translation" value={editText} onChange={(e) => setEditText(e.target.value)}/><button className="btn primary" onClick={() => void saveEquivalentEdit(item.id)}>Save</button><button className="btn" onClick={() => setEditingEquivalent(null)}>Cancel</button></div> : <div className="lawdict-actions"><button className="btn" onClick={() => { setEditingEquivalent(item.id); setEditText(item.text); }}>Edit</button><button className="btn" onClick={() => void changeReviewStatus(item.id, item.reviewStatus === 'reviewed' ? 'draft' : 'reviewed')}>{item.reviewStatus === 'reviewed' ? 'Draft করুন' : 'Reviewed চিহ্নিত করুন'}</button><button className="btn" onClick={() => void changeReviewStatus(item.id, 'verified')}>Verified চিহ্নিত করুন</button><button className="btn" onClick={() => void removeEquivalent(item.id)}>Delete</button></div>}</div>; }) : <p className="lawdict-muted">এখনো অনুবাদ যোগ করা হয়নি।</p>}
          <div className="lawdict-add">{selected.language === 'en' && <select aria-label="Translation sense" value={translationSenseId} onChange={(e) => setTranslationSenseId(e.target.value)}><option value="">সাধারণ অনুবাদ (সব sense)</option>{senses.map((sense) => <option key={sense.id} value={sense.id}>Sense {sense.senseNumber ?? ''} · {(sense.subject || sense.definition).slice(0, 90)}</option>)}</select>}<input value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder={selected.language === 'bn' ? 'English equivalent' : 'বাংলা অর্থ লিখুন'} aria-label="Translation equivalent"/><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="প্রাসঙ্গিকতা / আইনি context (ঐচ্ছিক)" aria-label="Translation context"/><button className="btn primary" disabled={!translation.trim()} onClick={() => void saveTranslation()}>অনুবাদ যোগ করুন</button></div>
          <h3>নতুন legal sense যোগ করুন</h3><div className="lawdict-add"><input aria-label="New legal sense" value={senseText} onChange={(e) => setSenseText(e.target.value)} placeholder="অতিরিক্ত অর্থ বা legal context"/><input aria-label="Sense subject" value={senseSubject} onChange={(e) => setSenseSubject(e.target.value)} placeholder="Subject: Contract / Property / Criminal…"/><button className="btn" disabled={!senseText.trim()} onClick={() => void saveSense()}>Sense যোগ করুন</button></div>
          <h3>সম্পর্কিত / Cross-reference শব্দ</h3><div className="lawdict-add lawdict-linker"><select aria-label="Relationship type" value={relationType} onChange={(e) => setRelationType(e.target.value as typeof relationType)}><option value="related">Related term</option><option value="see">See</option><option value="see_also">See also</option><option value="compare">Compare</option></select><input aria-label="Find existing dictionary entry to link" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder={selected.language === 'en' ? 'বাংলা headword খুঁজুন' : 'English headword খুঁজুন'}/></div>{linkResults.map((item) => <button key={item.id} className="lawdict-result" onClick={() => void saveLink(item)}>{item.title} <small>এই শব্দের সঙ্গে link করুন</small></button>)}{linked.length > 0 && <div className="lawdict-linked">{linked.map((item) => <button key={item.id} className="lawdict-result" onClick={() => { setSelected(item); setDirection(item.language); setQuery(item.title); setLinkQuery(''); }}>{item.title} <small>Open linked entry</small></button>)}</div>}
          <p className="lawdict-source">{selected.sourceId ? 'Source: A Dictionary of Law, Oxford University Press. UK-oriented source context-কে বাংলাদেশের আইন হিসেবে ধরে নেওয়া যাবে না।' : 'User-authored entry. কোনো আইনগত যাচাই সম্পন্ন হয়নি।'}</p>
        </>}
      </section>
    </div>
    <section className="lawdict-import"><div><strong>নতুন বাংলা headword</strong><p>নিজস্ব বাংলা আইনগত শব্দ ও তার ব্যাখ্যা যোগ করুন। ইংরেজি equivalent পরে সংযুক্ত করা যাবে।</p></div><div className="lawdict-add"><input aria-label="New Bangla headword" value={newHeadword} onChange={(e) => setNewHeadword(e.target.value)} placeholder="বাংলা শব্দ"/><input aria-label="Bangla definition" value={newDefinition} onChange={(e) => setNewDefinition(e.target.value)} placeholder="বাংলা ব্যাখ্যা (ঐচ্ছিক)"/><button className="btn" disabled={!newHeadword.trim()} onClick={() => void createHeadword()}>শব্দ যোগ করুন</button></div></section>
    <section className="lawdict-import"><div><strong>Duplicate headword audit</strong><p>একই ভাষায় একই normalized spelling-এর সম্ভাব্য duplicate খুঁজুন। এই audit কোনো শব্দ merge বা delete করে না।</p></div><button className="btn" onClick={() => void inspectDuplicates()}>Duplicate audit চালান</button>{duplicateGroups.length > 0 && <div className="lawdict-duplicate-list">{duplicateGroups.map((group) => <p key={group[0].id}><strong>{group[0].title}</strong> — {group.length}টি record ({group[0].language})</p>)}</div>}</section>
    <section className="lawdict-import"><div><strong>Oxford dataset import</strong><p>Extraction v4 ZIP থেকে একসঙ্গে এই ৩টি ফাইল নির্বাচন করুন: <code>pronotes_import_v4.jsonl</code>, <code>dictionary_senses_v3.jsonl</code> এবং <code>cross_references_resolved_v4.jsonl</code>। পৃথক senses ও uniquely matched cross-references যুক্ত হবে; ambiguous link স্বয়ংক্রিয়ভাবে তৈরি হবে না।</p></div><div><label className="btn">৩টি JSONL ফাইল নির্বাচন<input type="file" multiple accept=".jsonl,.txt,application/jsonl" disabled={busy} hidden onChange={(e) => { void importFile(e.target.files); e.currentTarget.value = ''; }}/></label>{busy && <button className="btn" onClick={() => (window as Window & { __lawDictionaryImportAbort?: AbortController }).__lawDictionaryImportAbort?.abort()}>Cancel import</button>}</div>{importProgress && <div className="lawdict-progress"><progress max={importProgress.total} value={importProgress.processed}/><small>{importProgress.processed.toLocaleString()} / {importProgress.total.toLocaleString()} · {importProgress.imported.toLocaleString()} imported · {importProgress.skipped.toLocaleString()} skipped</small></div>}</section>
  </main>;
}
