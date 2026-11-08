/**
 * AI assistant. Two ways to use it:
 *  1. Claude (your own subscription): the masked text and instruction are copied; paste them in the
 *     Claude app, copy its answer back here. Nothing is sent by ProNotes itself.
 *  2. Gemini (free API key, optional): sent from this device after a confirmation every time.
 * Either way, private details are replaced by placeholders first and put back in the answer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { findPrivate, mask, unmask, buildPrompt, cleanAnswer, geminiGenerate, AiError, AI_ERROR_TEXT, KIND_LABEL, TASKS, type Finding, type Task } from '../ai';
import { insertPlainText, selectedOrAll } from '../editor';
import { useT } from '../i18n';
import { PanelControls } from './ui';

interface Props {
  editor: Editor;
  say: (m: string, vars?: Record<string, string | number>) => void;
  /** Gemini key and model; key '' = not set up */
  gemini: { key: string; model: string };
  privateWords: string[];
  setPrivateWords: (w: string[]) => void;
  onOpenSettings: () => void;
  onClose?: () => void;
}

type Step = 'prepare' | 'answer';

export function AiPanel(p: Props) {
  const { t } = useT();
  const { editor, say } = p;
  const [task, setTask] = useState<Task>('polish');
  const [custom, setCustom] = useState('');
  const [source, setSource] = useState(() => selectedOrAll(editor.view));
  const [off, setOff] = useState<Set<string>>(new Set());
  const [word, setWord] = useState('');
  const [step, setStep] = useState<Step>('prepare');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [min, setMin] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // the selection may change while the panel is open
  useEffect(() => {
    const f = () => { if (step === 'prepare') setSource(selectedOrAll(editor.view)); };
    editor.on('selectionUpdate', f);
    return () => { editor.off('selectionUpdate', f); };
  }, [editor, step]);
  useEffect(() => () => abort.current?.abort(), []);

  const findings: Finding[] = useMemo(
    () => findPrivate(source.text, p.privateWords).map((f) => ({ ...f, on: !off.has(f.value) })),
    [source.text, p.privateWords, off],
  );
  const masked = useMemo(() => mask(source.text, findings), [source.text, findings]);
  const prompt = useMemo(() => buildPrompt(task, masked.text, custom), [task, masked.text, custom]);
  const result = useMemo(() => (answer.trim() ? unmask(cleanAnswer(answer), masked.map) : null), [answer, masked.map]);

  const toggle = (v: string) => setOff((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const addWord = () => {
    const w = word.trim();
    if (!w) return;
    if (!p.privateWords.includes(w)) p.setPrivateWords([...p.privateWords, w]);
    setWord('');
  };

  const copyForClaude = async () => {
    if (!source.text.trim()) return say('পাঠানোর মতো লেখা নেই');
    try {
      await navigator.clipboard.writeText(prompt);
      say('নির্দেশ আর লেখা কপি হয়েছে। Claude অ্যাপে পেস্ট করুন, উত্তর কপি করে এখানে পেস্ট করুন।');
    } catch {
      say('কপি করা গেল না; নিচের লেখাটা সিলেক্ট করে কপি করুন');
    }
    setStep('answer');
  };
  const openClaude = () => window.open('https://claude.ai/new', '_blank', 'noopener');

  const sendGemini = async () => {
    setConfirmSend(false);
    if (!source.text.trim()) return say('পাঠানোর মতো লেখা নেই');
    setBusy(true);
    setStep('answer');
    abort.current = new AbortController();
    try {
      setAnswer(await geminiGenerate(prompt, { key: p.gemini.key, model: p.gemini.model, signal: abort.current.signal }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const code = e instanceof AiError ? e.code : 'other';
      say(AI_ERROR_TEXT[code]);
    } finally {
      setBusy(false);
    }
  };

  const put = (replace: boolean) => {
    if (!result) return;
    editor.commands.focus();
    if (!replace) {
      const pos = editor.state.selection.to;
      editor.commands.setTextSelection(pos);
    }
    insertPlainText(editor.view, result.text);
    say('বসানো হয়েছে; Undo দিয়ে ফেরানো যায়');
  };

  return (
    <section className={'conv ai' + (min ? ' min' : '')} aria-label={t('AI সহকারী')} data-testid="ai-panel">
      <div className="conv-head">
        <h2 className="conv-title">✦ {t('AI সহকারী')}</h2>
        <div className="conv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={step === 'prepare'} data-testid="ai-step-prepare" onClick={() => setStep('prepare')}>{t('১. তৈরি')}</button>
          <button type="button" role="tab" aria-selected={step === 'answer'} data-testid="ai-step-answer" onClick={() => setStep('answer')}>{t('২. উত্তর')}</button>
        </div>
        {p.onClose && <PanelControls min={min} setMin={setMin} onClose={p.onClose} testid="ai" />}
      </div>

      {!min && step === 'prepare' && (
        <div className="conv-body two">
          <div>
            <h3>{t('কী করাবেন')}</h3>
            <select data-testid="ai-task" value={task} onChange={(e) => setTask(e.target.value as Task)}>
              {TASKS.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
            </select>
            {task === 'custom' && (
              <textarea data-testid="ai-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('যেমন: তারিখগুলো এক রকম করুন')} />
            )}
            <p className="note">{source.whole ? t('পুরো ড্রাফট যাবে। শুধু একটা অংশ পাঠাতে আগে সেটা সিলেক্ট করুন।') : t('সিলেক্ট করা অংশ যাবে।')}</p>
            <h3>{t('যা লুকানো হবে')}</h3>
            <ul className="ai-find" data-testid="ai-findings">
              {findings.length === 0 && <li className="note">{t('নাম, দাগ, দলিল নম্বর, ফোন কিছু পাওয়া যায়নি। থাকলে নিচে যোগ করুন।')}</li>}
              {findings.map((f) => (
                <li key={f.value}>
                  <label><input type="checkbox" checked={f.on} onChange={() => toggle(f.value)} /> <b>{f.value}</b> <small>{t(KIND_LABEL[f.kind])}</small></label>
                </li>
              ))}
            </ul>
            <div className="row">
              <input data-testid="ai-word" value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } }} placeholder={t('আরও কোনো নাম/শব্দ')} />
              <button type="button" className="btn small" data-testid="ai-word-add" onClick={addWord}>{t('লুকান')}</button>
            </div>
            <p className="note">{t('স্বয়ংক্রিয় খোঁজা সব নাম ধরতে পারে না। পাঠানোর আগে ডানের লেখাটা একবার দেখে নিন।')}</p>
          </div>
          <div>
            <h3>{t('যা যাবে (দেখে নিন)')}</h3>
            <pre className="ai-prompt" data-testid="ai-prompt">{masked.text || t('লেখা নেই')}</pre>
            <div className="row">
              <button type="button" className="btn primary" data-testid="ai-copy-claude" onClick={copyForClaude}>{t('কপি করুন (Claude-এর জন্য)')}</button>
              <button type="button" className="btn" data-testid="ai-open-claude" onClick={openClaude}>{t('Claude খুলুন ↗')}</button>
            </div>
            <p className="note">{t('Claude-এ: Settings → Privacy → “Help improve Claude” বন্ধ রাখুন, যাতে চ্যাট ট্রেনিং-এ না যায়।')}</p>
            <div className="row">
              {p.gemini.key ? (
                <button type="button" className="btn" data-testid="ai-gemini" disabled={busy} onClick={() => setConfirmSend(true)}>{t('Gemini দিয়ে চালান')}</button>
              ) : (
                <button type="button" className="btn" data-testid="ai-gemini-setup" onClick={p.onOpenSettings}>{t('Gemini (ফ্রি) চালু করুন…')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {!min && step === 'answer' && (
        <div className="conv-body two">
          <div>
            <h3>{busy ? t('Gemini লিখছে…') : t('উত্তর এখানে পেস্ট করুন')}</h3>
            <textarea data-testid="ai-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={busy}
              placeholder={t('Claude-এর উত্তর কপি করে এখানে পেস্ট করুন')} />
            {busy && <button type="button" className="btn small" onClick={() => { abort.current?.abort(); setBusy(false); }}>{t('থামান')}</button>}
          </div>
          <div>
            <h3>{t('আসল নামসহ')}</h3>
            <pre className="ai-prompt" data-testid="ai-result">{result?.text ?? ''}</pre>
            {result && result.missing.length > 0 && (
              <p className="note warn" data-testid="ai-missing">{t('উত্তরে এগুলো নেই, হাতে দেখে নিন: {list}', { list: result.missing.map((m) => `${m} = ${masked.map[m]}`).join(', ') })}</p>
            )}
            <div className="row">
              <button type="button" className="btn primary" data-testid="ai-replace" disabled={!result} onPointerDown={(e) => e.preventDefault()} onClick={() => put(true)}>{source.whole ? t('কার্সরে বসান') : t('সিলেক্ট করা অংশের জায়গায় বসান')}</button>
              <button type="button" className="btn" data-testid="ai-insert-after" disabled={!result} onPointerDown={(e) => e.preventDefault()} onClick={() => put(false)}>{t('পরে যোগ করুন')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmSend && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-c-title" data-testid="ai-confirm">
          <div className="box">
            <h2 id="ai-c-title">{t('Gemini-তে পাঠাবেন?')}</h2>
            <p>{t('ডানের লেখাটা (লুকানো নামসহ) Google-এর সার্ভারে যাবে। ফ্রি key-তে Google এই লেখা তাদের সেবা উন্নত করতে ব্যবহার করতে পারে, আর মানুষ পর্যালোচনা করতে পারে।')}</p>
            <p>{t('গোপন তথ্য বাকি থাকলে বাতিল করে আগে লুকান।')}</p>
            <div className="row">
              <button type="button" className="btn primary" data-testid="ai-confirm-ok" onClick={sendGemini}>{t('পাঠান')}</button>
              <button type="button" className="btn" data-testid="ai-confirm-cancel" onClick={() => setConfirmSend(false)}>{t('বাতিল')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
