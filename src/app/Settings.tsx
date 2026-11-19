import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toBijoy } from '../bijoy';
import type { DocFormat } from '../docx-export/format';
import { ENGLISH_FONTS, LOCAL_ANSI, LOCAL_UNI, WEB_FONTS, isFontAvailable } from '../fonts';
import { TOGGLE_KEYS, ANSI_KEYS, type Layout, type ToggleKey, type AnsiKey } from '../bornona-engine';
import type { VoicePrefs } from './prefs-types';
import { layoutAccept } from './layout-files';
import { load, save } from './prefs';
import { formatDateTime, num, useT, type UiLang } from '../i18n';
import { AUTO_MODEL, FREE_MODELS, readAuto, type AutoOrder } from '../ai/gemini';
import { LIVE_MODEL as LIVE_DEFAULT } from '../ai/live';
import { KEEP_CHOICES, type DriveBackup } from '../storage/gdrive';
import type { BackupLast } from './backup-status';
import type { VoiceModes } from './voice-modes';
import { NumberField } from './NumberField';
import { WORD_SHORTCUTS, showKeys } from '../editor/word-shortcuts';

export interface FontInfo {
  id: string;
  family: string;
  fileName: string;
  role: 'uni' | 'ansi';
  /** Read from the file: italic, and weight (400 regular, 700 bold). */
  italic?: boolean;
  weight?: number;
}

interface Props {
  /** The device the settings are open on: only its layout list is shown. */
  platform: 'desktop' | 'mobile';
  keyboardLayouts: Layout[];
  /** Layouts hidden from the layout box on computers / on touch devices (phone, iPad). */
  hiddenDesktop: string[];
  setHiddenDesktop: (v: string[]) => void;
  hiddenMobile: string[];
  setHiddenMobile: (v: string[]) => void;
  vf: boolean;
  setVf: (v: boolean) => void;
  oldReph: boolean;
  setOldReph: (v: boolean) => void;
  customLayouts: Layout[];
  onAddLayout: (f: File) => void;
  onDeleteLayout: (id: string) => void;
  voice: VoicePrefs;
  setVoice: (v: VoicePrefs) => void;
  voiceNote: string;
  corrections: string;
  setCorrections: (s: string) => void;
  format: DocFormat;
  setFormat: (f: DocFormat) => void;
  fonts: FontInfo[];
  onAddFont: (f: File, role: 'uni' | 'ansi') => void;
  onDeleteFont: (id: string) => void;
  ansiFont: string;
  setAnsiFont: (s: string) => void;
  enFont: string;
  setEnFont: (s: string) => void;
  autoBijoy: boolean;
  setAutoBijoy: (v: boolean) => void;
  wordCount: number;
  onLearnDoc: () => void;
  onExportWords: () => void;
  onImportWords: (f: File) => void;
  onResetWords: () => void;
  onBackup: (withKey: boolean) => void;
  onRestore: (f: File) => void;
  app: AppInfo;
  uiLang: UiLang;
  setUiLang: (l: UiLang) => void;
  fixChandra: boolean;
  setFixChandra: (v: boolean) => void;
  toggleKey: ToggleKey;
  setToggleKey: (k: ToggleKey) => void;
  ansiTyping: boolean;
  setAnsiTyping: (v: boolean) => void;
  ansiKey: AnsiKey;
  setAnsiKey: (k: AnsiKey) => void;
  ai: AiSettings;
  dict: { on: boolean; setOn: (v: boolean) => void; count: number };
  voiceEngine: 'auto' | 'ai' | 'device';
  voiceModes: VoiceModes;
  setVoiceModes: (m: VoiceModes) => void;
  setVoiceEngine: (v: 'auto' | 'ai' | 'device') => void;
  onClose: () => void;
  /** Google Drive backups (off when the build has no Google Client ID). */
  drive: DriveProps;
  /** When the last backups were made and how soon to remind (device-only). */
  backupInfo: { last: BackupLast; remind: number; setRemind: (h: number) => void };
}

export interface DriveProps {
  enabled: boolean;
  connected: boolean;
  busy: boolean;
  list: DriveBackup[] | null;
  onConnect: () => void;
  onBackup: () => void;
  /** Save one Drive backup as a file on this device. */
  onDownload: (b: DriveBackup) => void;
  onRefresh: () => void;
  onRestore: (b: DriveBackup) => void;
  onDelete: (b: DriveBackup) => void;
  /** How many backups to keep in Drive (0 = all). */
  keep: number;
  setKeep: (n: number) => void;
  /** The name typed for this device ('' = automatic), the automatic one, and the one in use. */
  deviceName: string;
  setDeviceName: (s: string) => void;
  autoDevice: string;
  thisDevice: string;
  onDisconnect: () => void;
  /** Back up to Drive by itself while connected (device-only setting). */
  auto: boolean;
  setAuto: (v: boolean) => void;
}

export interface AiSettings {
  key: string;
  setKey: (k: string) => void;
  model: string;
  setModel: (m: string) => void;
  privateWords: string[];
  setPrivateWords: (w: string[]) => void;
}

/** Gemini key (hidden), the model list and a short voice test. */
function AiKeyBox({ ai }: { ai: AiSettings; voice: { corrections: string; banglaDigits: boolean } }) {
  const { t } = useT();
  const [k, setK] = useState('');
  const [editing, setEditing] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'warn' | 'busy'; text: string } | null>(null);
  const [guide, setGuide] = useState(false);
  const fetchModels = async () => {
    setStatus({ kind: 'busy', text: t('দেখা হচ্ছে…') });
    try {
      const { geminiModels, rankModels } = await import('../ai/gemini');
      const list = rankModels(await geminiModels(ai.key));
      setModels(list);
      setStatus({ kind: 'ok', text: t('key কাজ করছে · {n}টা মডেল', { n: list.length }) });
    } catch (e) {
      const c = (e as { code?: string }).code;
      setStatus({ kind: 'warn', text: c === 'key' ? t('key ঠিক নেই') : c === 'network' ? t('ইন্টারনেট নেই') : t('যাচাই করা গেল না') });
    }
  };
  // "auto": time the free models, show which one is in use
  const [auto, setAuto] = useState<AutoOrder | null>(() => readAuto());
  const measure = async () => {
    const { measureFreeModels } = await import('../ai/gemini');
    setAuto(await measureFreeModels(ai.key));
  };
  // the list once a key is there, so the model box is a real choice
  useEffect(() => { if (ai.key && !models.length) void fetchModels(); }, [ai.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = [...new Set([ai.model, ...models].filter(Boolean))];
  const short = (m: string) => m.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ');

  if (!ai.key || editing) {
    return (
      <>
        <Line info="aistudio.google.com থেকে নিজের Google account দিয়ে ফ্রি API key নিন। ফ্রি key-তে Google পাঠানো লেখা তাদের সেবা উন্নত করতে ব্যবহার করতে পারে, তাই মক্কেলের আসল তথ্য কখনো পাঠাবেন না। key শুধু এই ডিভাইসে থাকে, ব্যাকআপ ফাইলে যায় না।">
          <input className="text" type="password" autoComplete="off" data-testid="ai-key-in" value={k} onChange={(e) => setK(e.target.value)} placeholder="AIza…" />
          <button type="button" className="btn small primary" data-testid="ai-key-save" disabled={!k.trim()} onClick={() => { ai.setKey(k); setK(''); setEditing(false); setModels([]); }}>{t('রাখুন')}</button>
        </Line>
        <details className="srow-more key-guide" data-testid="ai-key-guide" open={guide} onToggle={(e) => setGuide((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t('Gemini key কোথায় পাব? (ধাপে ধাপে)')}</summary>
          <ol>
            <li>{t('নিচের বাটনে Google AI Studio খুলুন, নিজের Google (Gmail) অ্যাকাউন্টে ঢুকুন।')}</li>
            <li>{t('প্রথমবার শর্তে রাজি হলে Google নিজেই একটা প্রজেক্ট আর key বানিয়ে দেয়; না দিলে "Create API key" চাপুন।')}</li>
            <li>{t('key-এর পাশে "Unrestricted" লেখা থাকলে "Add restrictions" → "Restrict to Gemini API only" → "Restrict key" চাপুন। Google এখন বাধাহীন key নেয় না।')}</li>
            <li>{t('key কপি করে নিচের ঘরে পেস্ট করুন, "রাখুন" চাপুন, তারপর "key যাচাই"।')}</li>
          </ol>
          <a className="btn small" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" data-testid="ai-key-studio">{t('Google AI Studio খুলুন ↗')}</a>
          <p className="note">{t('Billing চালু করবেন না — তাহলে খরচ হয় না, শুধু দিনের সীমা থাকে। key পাসওয়ার্ডের মতো: কাউকে দেবেন না; ফাঁস হলে AI Studio-তে নতুন key বানিয়ে পুরোনোটা মুছে দিন।')}</p>
        </details>
        {editing && <button type="button" className="btn small" onClick={() => setEditing(false)}>{t('বাতিল')}</button>}
      </>
    );
  }
  return (
    <>
      <div className="srow">
        <span data-testid="ai-key-set">Key <span className={'state ' + (status?.kind ?? '')}>…{ai.key.slice(-4)}</span></span>
        <span className="srow-actions">
          <button type="button" className="btn small" data-testid="ai-key-test" onClick={fetchModels}>{t('যাচাই')}</button>
          <button type="button" className="btn small" data-testid="ai-key-change" onClick={() => setEditing(true)}>{t('বদলান')}</button>
          <ArmedButton label={t('মুছুন')} armedLabel={t('নিশ্চিত?')} testid="ai-key-del" onConfirm={() => { ai.setKey(''); setStatus(null); setModels([]); }} />
        </span>
      </div>
      {status && <p className={'state-line ' + status.kind} data-testid="ai-key-status" role="status">{status.text}</p>}
      <label className="srow"><span>{t('মডেল')}</span>
        <select data-testid="ai-model" value={ai.model} onChange={(e) => ai.setModel(e.target.value)}>
          <option value={AUTO_MODEL}>{t('স্বয়ংক্রিয় (দ্রুততম ফ্রি)')}</option>
          {choices.filter((m) => m !== AUTO_MODEL).map((m, i) => <option key={m} value={m}>{short(m) + (i === 0 && models[0] === m ? ' · ' + t('প্রস্তাবিত') : '') + (FREE_MODELS.includes(m) ? ' · ' + t('ফ্রি') : '')}</option>)}
        </select>
      </label>
      {ai.model === AUTO_MODEL && (
        <p className="state-line" data-testid="ai-auto-status">
          {(() => {
            const best = auto?.order.filter((x) => x.ms > 0 && x.ms < 1e9).sort((p, q) => p.ms - q.ms)[0];
            return best ? t('এখন: {m}', { m: short(best.model) }) + ' · ' + t('{s} সেকেন্ড', { s: (best.ms / 1000).toFixed(1) })
              : t('প্রথমে Flash-Lite; আপনার কাজের সময় মেপে দ্রুততমটা আগে আসবে');
          })()}
          {' '}<button type="button" className="btn small" data-testid="ai-auto-measure" onClick={() => void measure()}>{t('আবার মাপুন')}</button>
        </p>
      )}
    </>
  );
}

/**
 * Voice: two cards (decisions.md 77). "লাইভ ভয়েস" — words appear while speaking (a tap on 🎙);
 * "রেকর্ড করে লেখা" — record, then Gemini writes it (🎙 held). Each can be on or off, has its own model
 * and its own test. With one off, 🎙 runs the other on a tap.
 */
function VoiceCards({ ai, voice, modes, setModes, engine }: { ai: AiSettings; voice: { corrections: string; banglaDigits: boolean }; modes: VoiceModes; setModes: (m: VoiceModes) => void; engine: ReactNode }) {
  const { t } = useT();
  const set = (m: Partial<VoiceModes>) => setModes({ ...modes, ...m });
  const [liveModels, setLiveModels] = useState<string[]>([]);
  useEffect(() => {
    if (!ai.key || !modes.live) return;
    let gone = false;
    void import('../ai/gemini').then(({ geminiLiveModels }) => geminiLiveModels(ai.key)).then((l) => { if (!gone) setLiveModels(l); }).catch(() => {});
    return () => { gone = true; };
  }, [ai.key, modes.live]);
  const short = (m: string) => m.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ');
  const recChoices = [AUTO_MODEL, ...FREE_MODELS];
  return (
    <>
      <div className="vcard" data-testid="voice-card-live">
        <Check testid="voice-live-on" checked={modes.live} onChange={(v) => set({ live: v })} label={t('লাইভ ভয়েস')}
          info="বলার সাথে সাথে লেখা পাতায় কার্সরের জায়গায় ধূসর হয়ে ভাসে, থামলে পাকা হয়। কিবোর্ডের 🎙 একবার চাপলে চালু হয়। Gemini key থাকলে Gemini Live, না থাকলে (কম্পিউটার/Android-এর Chrome-এ) ব্রাউজারের নিজের ভয়েস।" />
        {modes.live && (
          <>
            {ai.key && (
              <label className="srow"><span>{t('মডেল')}</span>
                <select data-testid="live-model" value={modes.liveModel} onChange={(e) => set({ liveModel: e.target.value })}>
                  <option value="">{short(LIVE_DEFAULT) + ' · ' + t('প্রস্তাবিত')}</option>
                  {liveModels.filter((m) => m !== LIVE_DEFAULT).map((m) => <option key={m} value={m}>{short(m)}</option>)}
                </select>
              </label>
            )}
            <LiveTest ai={ai} model={modes.liveModel} voice={voice} />
          </>
        )}
      </div>
      <div className="vcard" data-testid="voice-card-rec">
        <Check testid="voice-rec-on" checked={modes.rec} onChange={(v) => set({ rec: v })} label={t('রেকর্ড করে লেখা')}
          info="পুরোটা বলে থামালে অডিও Gemini-তে যায়, পুরো লেখা একবারে আসে — লম্বা কথায় সাধারণত বেশি নির্ভুল। লাইভ চালু থাকলে 🎙 চেপে ধরলে এটা চলে, লাইভ বন্ধ থাকলে একবার চাপলেই। Gemini key লাগে।" />
        {modes.rec && (
          <>
            {engine}
            {ai.key ? (
              <>
                <label className="srow"><span>{t('মডেল')}</span>
                  <select data-testid="rec-model" value={modes.recModel} onChange={(e) => set({ recModel: e.target.value })}>
                    <option value="">{t('AI সহকারীর মডেলই')}</option>
                    {recChoices.map((m) => <option key={m} value={m}>{m === AUTO_MODEL ? t('স্বয়ংক্রিয় (দ্রুততম ফ্রি)') : short(m) + ' · ' + t('ফ্রি')}</option>)}
                  </select>
                </label>
                <VoiceTest ai={{ ...ai, model: modes.recModel || ai.model }} voice={voice} />
              </>
            ) : <p className="state-line">{t('ওপরের Gemini অংশে key দিলে চালু হবে')}</p>}
          </>
        )}
      </div>
    </>
  );
}

/** Live for five seconds: shows what it heard, or where it stopped working. */
function LiveTest({ ai, model, voice }: { ai: AiSettings; model: string; voice: { corrections: string; banglaDigits: boolean } }) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'on'>('idle');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    const a = await import('../ai');
    const { parseCorrections } = await import('../voice');
    const kind = a.liveEngineKind(Boolean(ai.key));
    if (!kind) return setResult({ ok: false, text: t('এখানে Live ভয়েস চলে না: Settings-এ Gemini key দিন (বা কম্পিউটার/Android-এ Chrome ব্যবহার করুন)') });
    setResult(null);
    let heard = '';
    let last = '';
    let failed = '';
    const ev = { onInterim: (s: string) => { last = s; }, onFinal: (s: string) => { heard += (heard ? ' ' : '') + s; last = ''; },
      onState: (s: string, why?: string) => { if (s === 'cut') failed = why || 'cut'; } };
    const e = kind === 'gemini' ? new a.GeminiLive(ai.key, 'bn-BD', ev, model || undefined) : new a.BrowserLive('bn-BD', ev);
    try {
      await e.start();
    } catch (err) {
      return setResult({ ok: false, text: t('Live ভয়েস চালু হলো না') + ' (' + a.errText(err) + ')' });
    }
    setState('on');
    await new Promise((res) => setTimeout(res, 5000));
    await e.stop().catch(() => {});
    setState('idle');
    const text = a.polishTranscript((heard + ' ' + last).trim(), voice, parseCorrections);
    setResult(text ? { ok: true, text: t('চলছে') + ': “' + text + '”' } : { ok: false, text: failed ? t('সংযোগ কেটে গেছে') : t(a.VOICE_ERROR_TEXT.silent) });
  };
  return (
    <>
      <div className="srow">
        <span>{t('লাইভ পরীক্ষা')}</span>
        <button type="button" className="btn small" data-testid="live-test" disabled={state !== 'idle'} onClick={() => void run()}>
          {state === 'on' ? t('বলুন… (৫ সেকেন্ড)') : t('৫ সেকেন্ড বলুন')}
        </button>
      </div>
      {result && <p className={'state-line ' + (result.ok ? 'ok' : 'warn')} data-testid="live-test-result" role="status">{result.text}</p>}
    </>
  );
}

/** Records three seconds and sends them to Gemini: shows where voice typing stops working, if it does. */
function VoiceTest({ ai, voice }: { ai: AiSettings; voice: { corrections: string; banglaDigits: boolean } }) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    const ai2 = await import('../ai');
    const { parseCorrections } = await import('../voice');
    setResult(null);
    const r = new ai2.PcmRecorder();
    try {
      await r.start();
    } catch (e) {
      const stage = e instanceof ai2.VoiceError ? e.stage : 'mic';
      return setResult({ ok: false, text: t(ai2.VOICE_ERROR_TEXT[stage]) + ' (' + (e instanceof Error ? e.message : String(e)) + ')' });
    }
    setState('rec');
    await new Promise((res) => setTimeout(res, 3000));
    setState('busy');
    try {
      const samples = r.stop();
      const raw = await ai2.transcribe(samples, { key: ai.key, model: ai.model, onModelChange: ai.setModel, timeoutMs: 45_000 });
      const text = ai2.polishTranscript(raw, voice, parseCorrections);
      setResult(text ? { ok: true, text: t('চলছে') + ': “' + text + '”' } : { ok: false, text: t(ai2.VOICE_ERROR_TEXT.silent) });
    } catch (e) {
      if (e instanceof ai2.VoiceError) setResult({ ok: false, text: t(ai2.VOICE_ERROR_TEXT[e.stage]) + ' (' + e.message + ')' });
      else if (e instanceof ai2.AiError) { const m = ai2.aiErrorMessage(e); setResult({ ok: false, text: t(m.text) + (m.detail ? ' (Google: ' + m.detail + ')' : '') }); }
      else setResult({ ok: false, text: t('রেকর্ড করা কথা পড়া গেল না') + ' (' + ai2.errText(e) + ')' });
    } finally {
      setState('idle');
    }
  };
  return (
    <>
      <div className="srow">
        <span>{t('AI ভয়েস পরীক্ষা')}</span>
        <button type="button" className="btn small" data-testid="voice-test" disabled={state !== 'idle'} onClick={() => void run()}>
          {state === 'rec' ? t('বলুন… (৩ সেকেন্ড)') : state === 'busy' ? t('লেখা হচ্ছে…') : t('৩ সেকেন্ড বলুন')}
        </button>
      </div>
      {result && <p className={'state-line ' + (result.ok ? 'ok' : 'warn')} data-testid="voice-test-result" role="status">{result.text}</p>}
    </>
  );
}

/** Font names are shown as the fonts call themselves. */
const fontLabel = (f: string) => f;

export interface AppInfo {
  /** Service worker possible here (https/localhost, not the preview). */
  supported: boolean;
  offlineReady: boolean;
  standalone: boolean;
  apple: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onCheckUpdate: () => void;
  /** The browser promised to keep this site's data (null: not known yet / not supported). */
  persisted: boolean | null;
  onPersist: () => void;
}

const FORMAT_NAME = { avro: 'Avro', openbangla: 'OpenBangla', kmx: 'Keyman' } as const;

/** Hidden file input + button. */
function FileButton(p: { label: string; accept?: string; testid: string; onFile: (f: File) => void; primary?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={'btn' + (p.primary ? ' primary' : '')} data-testid={p.testid + '-btn'} onClick={() => ref.current?.click()}>{p.label}</button>
      <input ref={ref} type="file" accept={p.accept} hidden data-testid={p.testid + '-file'}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onFile(f); }} />
    </>
  );
}

/** A delete button that must be pressed twice within 4 seconds (no accidental loss). */
function ArmedButton(p: { label: string; armedLabel: string; testid: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const t = useRef<number>(undefined);
  return (
    <button type="button" className={'btn' + (armed ? ' warn' : '')} data-testid={p.testid}
      onClick={() => {
        if (armed) {
          clearTimeout(t.current);
          setArmed(false);
          p.onConfirm();
          return;
        }
        setArmed(true);
        t.current = window.setTimeout(() => setArmed(false), 4000);
      }}>
      {armed ? p.armedLabel : p.label}
    </button>
  );
}

const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';

export function Settings(p: Props) {
  const [loupe, setLoupe] = useState<boolean>(() => load('kb.loupe', true));
  const { t } = useT();
  // the Drive backup list is folded away until asked for
  const [driveOpen, setDriveOpen] = useState(false);
  const uniFonts = p.fonts.filter((f) => f.role === 'uni');
  const ansiFonts = p.fonts.filter((f) => f.role === 'ansi');
  const here = (name: string, ansi = false) => p.fonts.some((f) => f.family === name) || WEB_FONTS.includes(name) || isFontAvailable(name, ansi);
  const pageFonts = [...new Set([...LOCAL_UNI, ...WEB_FONTS, ...uniFonts.map((f) => f.family), p.format.font])];
  const ansiChoices = [...new Set([...LOCAL_ANSI, ...ansiFonts.map((f) => f.family)])];
  const sv = (patch: Partial<VoicePrefs>) => p.setVoice({ ...p.voice, ...patch });
  const [withKey, setWithKey] = useState(false);
  // families that have only italic or bold files: normal text would be drawn slanted or heavy
  const noRegular = [...new Set(p.fonts.map((f) => f.family))].filter((fam) => !p.fonts.some((f) => f.family === fam && !f.italic && (f.weight ?? 400) < 600));
  const hiddenOf = (platform: 'desktop' | 'mobile') => (platform === 'desktop' ? p.hiddenDesktop : p.hiddenMobile);
  const setLayoutShown = (platform: 'desktop' | 'mobile', id: string, shown: boolean) => {
    const current = hiddenOf(platform);
    const next = shown ? current.filter((x) => x !== id) : [...new Set([...current, id])];
    if (platform === 'desktop') p.setHiddenDesktop(next); else p.setHiddenMobile(next);
  };

  const [tab, setTabState] = useState<SettingsTab>(() => {
    const v = load<string>('settings.tab', 'type');
    return (TABS.some((x) => x.id === v) ? v : 'type') as SettingsTab;
  });
  const setTab = (v: SettingsTab) => { setTabState(v); save('settings.tab', v); };
  const en = p.uiLang === 'en';

  return (
    <section className="settings" aria-label={t('সেটিংস')} data-testid="settings-panel">
      <header className="settings-head">
        <h2>{t('সেটিংস')}</h2>
        <SavedLine />
        <button type="button" className="settings-x" aria-label={t('বন্ধ করুন')} title={t('বন্ধ করুন')} data-testid="settings-close" onClick={p.onClose}>✕</button>
      </header>
      <nav className="settings-tabs" role="tablist" aria-label={t('সেটিংস')}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-testid={'stab-' + x.id} onClick={() => setTab(x.id)}>{t(x.label)}</button>
        ))}
      </nav>

      <div className="settings-body" role="tabpanel" data-testid={'stab-panel-' + tab}>
      {tab === 'type' && (
        <>
          <Group title={t('কিবোর্ড লেআউট')} info={p.platform === 'mobile'
            ? 'এই ডিভাইসের (Mobile/iPad) লেআউট বাক্সে কোনগুলো থাকবে বেছে নিন। কম্পিউটারের তালিকা কম্পিউটার থেকে বদলান।'
            : 'এই কম্পিউটারের লেআউট বাক্সে কোনগুলো থাকবে বেছে নিন। iPad/ফোনের তালিকা সেখান থেকে বদলান।'}>
            <div data-testid="enabled-layouts">
              {[p.platform].map((platform) => {
                const hidden = hiddenOf(platform);
                const shownCount = p.keyboardLayouts.filter((l) => !hidden.includes(l.id)).length;
                return <div key={platform} className="checks">
                  {p.keyboardLayouts.map((l) => {
                    const shown = !hidden.includes(l.id);
                    // at least one layout stays in the box
                    return <label key={l.id} className="srow layout-check"><span>{l.name}</span><input type="checkbox" data-testid={'layout-enabled-' + platform + '-' + l.id}
                      checked={shown} disabled={shown && shownCount <= 1} onChange={(e) => setLayoutShown(platform, l.id, e.target.checked)} /></label>;
                  })}
                </div>;
              })}
            </div>
            <Line info="অন্য লেআউট যোগ করা যায়: Avro (.avrolayout), OpenBangla (.json), Keyman (.kmx বা .kmp)। ফাইলটা শুধু এই ডিভাইসে থাকে (ব্যাকআপে যায়)।">
              <FileButton label={t('লেআউট যোগ করুন')} accept={layoutAccept()} testid="layout-add" onFile={p.onAddLayout} />
            </Line>
            {p.customLayouts.length > 0 && (
              <ul className="itemlist" data-testid="layout-list">
                {p.customLayouts.map((l) => (
                  <li key={l.id}>
                    <span>{l.name}</span>
                    <small>{FORMAT_NAME[l.format ?? 'avro']}{l.kmx ? ' · ' + t(l.kmx.enc === 'ansi' ? 'রুল, বিজয়' : 'রুল') : ''}{l.dev ? ' · ' + l.dev.slice(0, 30) : ''}</small>
                    <ArmedButton label={t('মুছুন')} armedLabel={t('নিশ্চিত?')} testid={'layout-del-' + l.id} onConfirm={() => p.onDeleteLayout(l.id)} />
                  </li>
                ))}
              </ul>
            )}
          </Group>
          <Group title={t('অন-স্ক্রিন কিবোর্ড')} info="ProNotes-এর নিজের কিবোর্ড খোলা থাকলে কার্সর নীল ও মোটা দেখায়; লেখায় চাপলে নিচে একটা ফোঁটা আসে, ধরে টানলে কার্সর সরে। Space চেপে টানলেও কার্সর সরে।">
            <Check testid="kb-loupe" checked={loupe} onChange={(v) => { setLoupe(v); save('kb.loupe', v); }} label={t('কার্সর সরানোর সময় বড় করে দেখান')}
              info="ফোঁটা বা Space টেনে কার্সর সরানোর সময় কার্সরের দুপাশের লেখা একটা ছোট জানালায় বড় করে দেখায়, যাতে কোন অক্ষরের পাশে কার্সর বসছে বোঝা যায়।" />
          </Group>
          <Group title={t('শর্টকাট key')} info="iPad-এ Ctrl+Space অনেক সময় iPad নিজেই ভাষা বদলাতে নিয়ে নেয়; তখন F12 বা Ctrl+M বেছে নিন। ফিজিক্যাল কিবোর্ডেই কাজ করে; অন-স্ক্রিন কিবোর্ডে EN/বাং বাটন আছে।">
            <label className="srow"><span>{t('বাংলা ⇄ English বদল')}</span>
              <select data-testid="toggle-key" value={p.toggleKey} onChange={(e) => p.setToggleKey(e.target.value as ToggleKey)}>
                {TOGGLE_KEYS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="srow"><span>{t('ইউনিকোড ⇄ ANSI বদল')}</span>
              <select data-testid="ansi-key" value={p.ansiKey} onChange={(e) => p.setAnsiKey(e.target.value as AnsiKey)}>
                {ANSI_KEYS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
              </select>
            </label>
            <details className="srow-more" data-testid="settings-shortcuts">
              <summary>{t('কিবোর্ড শর্টকাট (Word-এর মতো)')}</summary>
              <p className="note">{t('MS Word-এর শর্টকাট এখানেও চলে; বাংলা লেআউটে লিখলেও একই কী। বাংলা/ইংরেজি বদল আর ANSI-র কী আগে কাজ করে। ব্রাউজার নিজে কিছু কী রেখে দেয় (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab), অ্যাপ হিসেবে ইনস্টল করলে বেশিরভাগ পাওয়া যায়।')}</p>
              {([['char', 'অক্ষর'], ['para', 'প্যারা'], ['edit', 'লেখা ও চিহ্ন'], ['file', 'ফাইল']] as const).map(([g, label]) => (
                <div key={g}>
                  <h4 className="sub-h">{t(label)}</h4>
                  <table className="kb-shortcuts">
                    <tbody>
                      {WORD_SHORTCUTS.filter((s) => s.group === g).map((s) => (
                        <tr key={s.keys}><td><kbd>{showKeys(s.keys)}</kbd></td><td>{t(s.what)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          </Group>
          <Group title={t('টাইপিং-এর ধরন')} info="ProNotes নির্দিষ্ট লেআউটে (Fixed Keyboard Layout) আধুনিক ধরনে টাইপ করে: কার সবসময় ব্যঞ্জনবর্ণের পরে চাপতে হয়।">
            <Check testid="oldreph" checked={p.oldReph} onChange={p.setOldReph} label={t('বিজয়-ধাঁচের রেফ')} info="বিজয়-ধাঁচের রেফ: বর্ণ লেখার পরে রেফ চাপুন (ক ম রেফ লিখলে হবে কর্ম)" />
            <Check testid="vf" checked={p.vf} onChange={p.setVf} label={t('স্বর-গঠন')} info="স্বর-গঠন: শব্দের শুরুতে বা স্বরবর্ণের পরে কার চাপুন (ি চাপলে হবে ই, ে চাপলে এ, অ-এর পরে া চাপলে আ)" />
            <Check testid="fix-chandra" checked={p.fixChandra} onChange={p.setFixChandra} label={t('চন্দ্রবিন্দু নিজে ঠিক করো')} info="চন্দ্রবিন্দুর জায়গা নিজে থেকে ঠিক করো (ক ঁ া লিখলে হবে কাঁ)" />
            <Check testid="ansi-typing" checked={p.ansiTyping} onChange={p.setAnsiTyping} label={t('বিজয় (ANSI)-তে টাইপ (পরীক্ষামূলক)')} info="শুধু পুরোনো SutonnyMJ ফাইলে কপি-পেস্ট করার জন্য। এই অবস্থায় শব্দের পরামর্শ, শেখা, কথা বলে লেখা আর খোঁজা ঠিকমতো কাজ করে না, আর ফন্ট না থাকলে লেখা ভাঙা দেখায়। সাধারণ কাজে ইউনিকোডে লিখে “কপি: ANSI” বা বিজয় Word ফাইল নেওয়াই ভালো। পরে Converter → “পুরো ড্রাফট ইউনিকোডে” দিয়ে ফেরানো যায়।" />
          </Group>
        </>
      )}

      {tab === 'voice' && (
        <>
          <Group title="Gemini" info="দুইভাবে চলে: (১) আপনার Claude সাবস্ক্রিপশন — ProNotes লেখা কপি করে দেয়, আপনি Claude অ্যাপে পেস্ট করে উত্তর এনে দেন; ProNotes নিজে কিছু পাঠায় না। (২) Gemini-র ফ্রি API key দিলে এখান থেকেই চলে, প্রতিবার জিজ্ঞেস করে। দুই ক্ষেত্রেই নাম, দাগ, দলিল নম্বর, ফোন আগে লুকানো হয় আর উত্তরে ফিরে আসে।">
            <AiKeyBox ai={p.ai} voice={{ corrections: p.corrections, banglaDigits: p.voice.banglaDigits }} />
          </Group>
          <Group title={t('ভয়েস টাইপিং')} info="key ছাড়া বিকল্প (পরখ করে দেখুন): Google-এর ফ্রি Gboard কিবোর্ড অ্যাপ বসিয়ে বাংলা যোগ করুন, ProNotes-এ লেখার সময় সেই কিবোর্ডের মাইক চাপুন। ফোনের নিজের কিবোর্ডে যা আসে, ProNotes-এ সরাসরি বসে। Apple-এর নিজের ডিকটেশনে বাংলা আছে বলে নিশ্চিত হওয়া যায়নি।">
            <VoiceCards ai={p.ai} voice={{ corrections: p.corrections, banglaDigits: p.voice.banglaDigits }} modes={p.voiceModes} setModes={p.setVoiceModes}
              engine={<label className="srow"><span>{t('মাইক চলবে')}</span>
                <select data-testid="voice-engine" value={p.voiceEngine} onChange={(e) => p.setVoiceEngine(e.target.value as 'auto' | 'ai' | 'device')}>
                  <option value="auto">{t('নিজে থেকে')}</option>
                  <option value="ai">{t('AI ভয়েস (Gemini)')}</option>
                  <option value="device">{t('ডিভাইসের ভয়েস')}</option>
                </select>
              </label>} />
            <label className="srow"><span>{t('ভাষা')}</span>
              <select data-testid="vlang" value={p.voice.lang} onChange={(e) => sv({ lang: e.target.value })}>
                <option value="auto">{t('লেখার মোড অনুযায়ী (বাংলা / English)')}</option>
                <option value="bn-BD">{t('বাংলা (বাংলাদেশ)')}</option>
                <option value="bn-IN">{t('বাংলা (ভারত)')}</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-IN">English (India)</option>
              </select>
            </label>
            <Check testid="vcmd" checked={p.voice.commands} onChange={(v) => sv({ commands: v })} label={t('বলা যতিচিহ্ন বসাও')} info="বলা যতিচিহ্ন বসাও (দাঁড়ি, কমা, নতুন লাইন)" />
            <Check testid="vdig" checked={p.voice.banglaDigits} onChange={(v) => sv({ banglaDigits: v })} label={t('সংখ্যা বাংলা অঙ্কে')} />
            <details className="srow-more" open={!!p.corrections.trim() || undefined}>
              <summary data-testid="corr-open">{t('ভয়েসের ভুল সংশোধন')}</summary>
              <Line info="প্রতি লাইনে একটা: ভুল = ঠিক। যেমন: এক্তিয়ার = এখতিয়ার">
                <textarea id="corr" data-testid="corr" spellCheck={false} placeholder={en ? 'wrong = right' : t('এক্তিয়ার = এখতিয়ার')} value={p.corrections} onChange={(e) => p.setCorrections(e.target.value)} />
              </Line>
            </details>
            {p.voiceNote && <Line info={p.voiceNote}><span className="muted">{t('এই ডিভাইসের ভয়েস')}</span></Line>}
          </Group>
          <Group title={t('সবসময় লুকানো শব্দ')} info="যে নাম/শব্দগুলো AI-তে পাঠানোর আগে সবসময় লুকানো হবে (এই ডিভাইসে থাকে)।">
            {p.ai.privateWords.length === 0 && <p className="muted">{t('কোনো শব্দ নেই')}</p>}
            <ul className="itemlist" data-testid="ai-words">
              {p.ai.privateWords.map((w) => (
                <li key={w}><span>{w}</span><button type="button" className="btn small" onClick={() => p.ai.setPrivateWords(p.ai.privateWords.filter((x) => x !== w))}>{t('বাদ দিন')}</button></li>
              ))}
            </ul>
          </Group>
        </>
      )}

      {tab === 'font' && (
        <>
          <Group title={t('ড্রাফটের ডিফল্ট ফন্ট')} info="ফন্ট এই ডিভাইসে না থাকলে পর্দায় অন্য ফন্টে দেখাবে, কিন্তু Word ফাইলে নাম এটাই থাকবে; যে কম্পিউটারে ফাইলটা খুলবেন সেখানে ফন্টটা থাকলেই হবে। কাগজ ও মার্জিন এখন রিবনের “পাতা” ট্যাবে।">
            <label className="srow"><span>{t('বাংলা ড্রাফট')}</span>
              <select data-testid="fmt-font" value={p.format.font} onChange={(e) => p.setFormat({ ...p.format, font: e.target.value })}>
                {pageFonts.map((f) => <option key={f} value={f}>{fontLabel(f) + (here(f) ? '' : ' ' + t('(এই ডিভাইসে নেই)'))}</option>)}
              </select>
            </label>
            <label className="srow"><span>{t('English ড্রাফট')}</span>
              <select data-testid="fmt-font-en" value={p.format.fontEn} onChange={(e) => p.setFormat({ ...p.format, fontEn: e.target.value })}>
                {[...new Set([p.format.fontEn, ...ENGLISH_FONTS])].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="srow"><span>{t('মূল লেখা (pt)')}</span>
              <NumberField min={8} max={40} step={0.5} steppers testid="fmt-size" value={p.format.size} onChange={(n) => p.setFormat({ ...p.format, size: n })} />
            </label>
            <label className="srow"><span>{t('বড় শিরোনাম (pt)')}</span>
              <NumberField min={8} max={60} step={0.5} steppers testid="fmt-title" value={p.format.titleSize} onChange={(n) => p.setFormat({ ...p.format, titleSize: n })} />
            </label>
            <label className="srow"><span>{t('লাইন স্পেসিং')}</span>
              <select data-testid="fmt-line" value={p.format.lineSpacing} onChange={(e) => p.setFormat({ ...p.format, lineSpacing: Number(e.target.value) })}>
                <option value={1}>1.0</option><option value={1.15}>1.15</option><option value={1.5}>1.5</option><option value={2}>2.0</option>
              </select>
            </label>
          </Group>
          <Group title={t('বিজয় (ANSI)')} info="Word থেকে কপি করলে শুধু SutonnyMJ-জাতীয় ফন্টের অংশ বদলায়, ইংরেজি অংশ যেমন আছে থাকে। টুলস ট্যাবের Converter-এ দুই দিকের রূপান্তর আছে।">
            <label className="srow"><span>{t('বিজয় লেখা দেখার ফন্ট')}</span>
              <select data-testid="ansi-font" value={p.ansiFont} onChange={(e) => p.setAnsiFont(e.target.value)}>
                <option value="">{t('ফন্ট ছাড়া (ইংরেজি অক্ষরে দেখাবে)')}</option>
                {ansiChoices.map((n) => <option key={n} value={n}>{n + (here(n, true) ? '' : ' ' + t('(এই ডিভাইসে নেই)'))}</option>)}
              </select>
            </label>
            <label className="srow"><span>{t('Word-এ বিজয় লেখার ইংরেজি অংশ')}</span>
              <select data-testid="en-font" value={p.enFont} onChange={(e) => p.setEnFont(e.target.value)}>
                {ENGLISH_FONTS.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <Check testid="auto-bijoy" checked={p.autoBijoy} onChange={p.setAutoBijoy} label={t('পেস্ট করা বিজয় লেখা ইউনিকোডে')} info="বিজয় লেখা পেস্ট করলে নিজে থেকে ইউনিকোডে বদলাও" />
          </Group>
          <Group title={t('নিজের ফন্ট ফাইল')} info="যে ফন্ট এই ডিভাইসে নেই (যেমন iPad-এ SutonnyOMJ), তার ফাইল (.ttf, .otf, .woff) যোগ করুন, তাহলে পর্দায় সেই ফন্টেই দেখাবে। ফাইলটা শুধু এই ডিভাইসে থাকে, ব্যাকআপে যায় না।">
            <div className="row">
              <FileButton label={t('ইউনিকোড ফন্ট যোগ করুন')} accept={FONT_ACCEPT} testid="font-add-uni" onFile={(f) => p.onAddFont(f, 'uni')} />
              <FileButton label={t('বিজয় (ANSI) ফন্ট যোগ করুন')} accept={FONT_ACCEPT} testid="font-add-ansi" onFile={(f) => p.onAddFont(f, 'ansi')} />
            </div>
            {noRegular.length > 0 && (
              <p className="note warn" data-testid="font-no-regular">{t('{f}: শুধু Italic/Bold ফাইল আছে, সাধারণ (Regular) ফাইল নেই — তাই সাধারণ লেখাও বাঁকা বা মোটা দেখাবে। Regular ফাইলটা যোগ করুন।', { f: noRegular.join(', ') })}</p>
            )}
            {p.fonts.length > 0 && (
              <ul className="itemlist" data-testid="font-list">
                {p.fonts.map((f) => (
                  <li key={f.id}>
                    {/* the name in the app's font; the sample in the font itself (Bijoy-encoded for ANSI, so it reads as Bangla); in an English menu the sample is the name */}
                    <span className="fl-name">{f.family} <small>{styleName(f)}</small></span>
                    <span className="fl-sample" style={{ fontFamily: `"${f.family}", var(--f-sans)`, fontStyle: f.italic ? 'italic' : 'normal', fontWeight: f.weight ?? 400 }}>{en ? 'Aa Bb 123' : f.role === 'ansi' ? SAMPLE_BIJOY : 'আমার সোনার বাংলা'}</span>
                    <small>{f.role === 'ansi' ? 'ANSI' : t('ইউনিকোড')}</small>
                    <ArmedButton label={t('মুছুন')} armedLabel={t('নিশ্চিত?')} testid={'font-del-' + f.id} onConfirm={() => p.onDeleteFont(f.id)} />
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </>
      )}

      {tab === 'words' && (
        <>
          <Group title={t('শব্দভান্ডার')}>
            <Check testid="dict-on" checked={p.dict.on} onChange={p.dict.setOn} label={t('বাংলা অভিধানের শব্দও পরামর্শে দেখাও')}
              info={p.dict.on ? (p.dict.count ? 'অভিধান: {n}টা শব্দ (উৎস: bangla-spellcheck-dict)। আপনার নিজের শব্দ সবসময় আগে আসে; দুই অক্ষর লেখার পর অভিধানের শব্দ আসে।' : 'অভিধান লোড হচ্ছে…') : 'অভিধান বন্ধ: শুধু আপনার শেখা শব্দ ও আইনি শব্দ।'}
              infoVars={{ n: num(p.dict.count, p.uiLang) }} />
            <p className="muted" data-testid="dict-status">{p.dict.on ? (p.dict.count ? t('অভিধান: {n}টা শব্দ', { n: p.dict.count }) : t('অভিধান লোড হচ্ছে…')) : t('অভিধান বন্ধ')}</p>
          </Group>
          <Group title={t('শেখা শব্দ')} info="মোছার আগে এক্সপোর্ট করে রাখুন; মুছলে ফেরত আনা যায় না।">
            <p className="muted" data-testid="word-count">{t('শেখা শব্দ: {n}টা', { n: p.wordCount })}</p>
            <div className="row">
              <button type="button" className="btn" data-testid="learn-doc" onClick={p.onLearnDoc}>{t('এই ড্রাফট থেকে শব্দ শিখুন')}</button>
              <button type="button" className="btn" data-testid="words-export" onClick={p.onExportWords}>{t('এক্সপোর্ট')}</button>
              <FileButton label={t('ইমপোর্ট')} accept=".json,application/json" testid="words-import" onFile={p.onImportWords} />
              <ArmedButton label={t('শেখা শব্দ মুছুন')} armedLabel={t('আবার চাপলে মুছে যাবে')} testid="words-reset" onConfirm={p.onResetWords} />
            </div>
          </Group>
        </>
      )}

      {tab === 'app' && (
        <>
          <Group title={t('মেনুর ভাষা')} info="শুধু মেনু ও বাটনের লেখা বদলায়। টাইপিং-এর ভাষা (উপরের বা/e বোতাম) আর ডকুমেন্ট আলাদা।">
            <div className="seg small" role="group" aria-label={t('মেনুর ভাষা')}>
              <button type="button" aria-pressed={p.uiLang === 'bn'} data-testid="ui-bn" onClick={() => p.setUiLang('bn')}>{en ? 'Bangla' : 'বাংলা'}</button>
              <button type="button" aria-pressed={p.uiLang === 'en'} data-testid="ui-en" onClick={() => p.setUiLang('en')}>English</button>
            </div>
          </Group>
          <Group title={t('ব্যাকআপ')} info="সব ড্রাফট (ট্র্যাশসহ), শেখা শব্দ, নিজের লেআউট, ভয়েসের সংশোধন আর সেটিংস একটা ফাইলে (ফন্ট ফাইল বাদে)। দুই জায়গায় রাখা যায়: এই ডিভাইসে (iPad-এ Files বা iCloud Drive) আর আপনার নিজের Google Drive-এর “ProNotes Backups” ফোল্ডারে। Drive-এ Gemini key কখনো যায় না। ফেরত আনলে একই ড্রাফট আলাদা কপি হয় না: যেটা পরে বদলানো হয়েছে সেটা থাকে, অন্যটা ড্রাফটের ভার্সন-ইতিহাসে রাখা হয়, তাই কিছু হারায় না।" fold={{ id: 'backup', summary: !p.backupInfo.last.drive && !p.backupInfo.last.device ? t('এখনো কোনো ব্যাকআপ নেওয়া হয়নি')
            : t('শেষ ব্যাকআপ') + ': ' + formatDateTime(Math.max(p.backupInfo.last.drive ?? 0, p.backupInfo.last.device ?? 0), p.uiLang) }}>
            <p className="backup-status muted" data-testid="backup-status">
              {!p.backupInfo.last.drive && !p.backupInfo.last.device ? t('এখনো কোনো ব্যাকআপ নেওয়া হয়নি') : (
                <>
                  {t('শেষ ব্যাকআপ')}:{' '}
                  {p.backupInfo.last.drive ? <span>Drive {formatDateTime(p.backupInfo.last.drive, p.uiLang)}</span> : null}
                  {p.backupInfo.last.drive && p.backupInfo.last.device ? ' · ' : null}
                  {p.backupInfo.last.device ? <span>{t('এই ডিভাইস')} {formatDateTime(p.backupInfo.last.device, p.uiLang)}</span> : null}
                </>
              )}
            </p>
            <div className="row backup-two">
              <button type="button" className="btn primary" data-testid="backup" onClick={() => p.onBackup(withKey)}>⤓ {t('এই ডিভাইসে')}</button>
              {p.drive.enabled && (p.drive.connected
                ? <button type="button" className="btn primary" data-testid="drive-backup" disabled={p.drive.busy} onClick={p.drive.onBackup}>{p.drive.busy ? t('কাজ চলছে…') : '☁ ' + t('Google Drive-এ')}</button>
                : <button type="button" className="btn" data-testid="drive-connect" onClick={p.drive.onConnect}>☁ {t('Google দিয়ে যুক্ত করুন')}</button>)}
            </div>
            {p.ai.key && (
              <Check testid="backup-key" checked={withKey} onChange={setWithKey} label={t('Gemini key-ও ব্যাকআপে')} info="শুধু এই ডিভাইসের ফাইলে Gemini key-ও রাখুন (ফাইলটা তখন পাসওয়ার্ডের মতো গোপনে রাখবেন)। Drive-এ key যায় না।" />
            )}
            <div className="row">
              <FileButton label={t('ব্যাকআপ থেকে ফেরত আনুন')} accept=".json,application/json" testid="restore" onFile={p.onRestore} />
            </div>
            <Line info="এতক্ষণ কোনো ব্যাকআপ (Drive বা ডিভাইস) না হলে ProNotes খুললে মনে করিয়ে দেবে; সেখান থেকেই ব্যাকআপ নেওয়া যায়। “পরে” চাপলে ১২ ঘণ্টা পর আবার।">
              <label className="srow"><span>{t('মনে করিয়ে দিন')}</span>
                <select data-testid="backup-remind" value={p.backupInfo.remind} onChange={(e) => p.backupInfo.setRemind(Number(e.target.value))}>
                  <option value={0}>{t('বন্ধ')}</option>
                  <option value={12}>{t('১২ ঘণ্টা পর')}</option>
                  <option value={24}>{t('১ দিন পর')}</option>
                  <option value={72}>{t('৩ দিন পর')}</option>
                </select>
              </label>
            </Line>
            {!p.drive.enabled ? (
              <Line info="সাইটের মালিক Google Cloud-এ OAuth Client ID বানিয়ে GitHub-এর Secrets-এ GOOGLE_CLIENT_ID নামে রাখলে পরের deploy থেকে চালু হবে।"><span className="muted" data-testid="drive-off">{t('এই সাইটে Google Drive চালু করা হয়নি')}</span></Line>
            ) : p.drive.connected && (
              <>
                <Check testid="drive-auto" checked={p.drive.auto} onChange={p.drive.setAuto} label={t('Drive-এ নিজে থেকে ব্যাকআপ')}
                  info="Google Drive যুক্ত থাকা অবস্থায় ড্রাফট বদলালে ProNotes পেছনে গেলে আর প্রতি ১৫ মিনিটে নীরবে Drive-এ ব্যাকআপ নেয়। Google-এর অনুমতি প্রায় এক ঘণ্টা থাকে; মেয়াদ গেলে আবার যুক্ত করতে হয়।" />
                <Line info="নতুন ব্যাকআপ Drive-এ ঠিকমতো রাখা হলে তবেই সবচেয়ে পুরোনোগুলো Drive-এর Trash-এ যায়; ৩০ দিন পর্যন্ত drive.google.com-এর Trash থেকে ফেরত আনা যায়। সংখ্যা কমালে পরের ব্যাকআপের সময় বাড়তিগুলো সরে।">
                  <label className="srow"><span>{t('Drive-এ রাখুন')}</span>
                    <select data-testid="drive-keep" value={p.drive.keep} onChange={(e) => p.drive.setKeep(Number(e.target.value))}>
                      {KEEP_CHOICES.map((n) => <option key={n} value={n}>{n ? t('শেষ {n}টা', { n }) : t('সবগুলো')}</option>)}
                    </select>
                  </label>
                </Line>
                <Line info="প্রতিটা ব্যাকআপে এই নাম লেখা থাকে, তাই তালিকায় দেখা যায় কোনটা কোন ডিভাইস থেকে। খালি রাখলে ডিভাইসের ধরন নিজে বসে (যেমন iPad)। নামটা শুধু এই ডিভাইসে থাকে, ব্যাকআপ থেকে ফেরত আনলে অন্য ডিভাইসে যায় না।">
                  <label className="srow"><span>{t('এই ডিভাইসের নাম')}</span>
                    <input type="text" data-testid="device-name" maxLength={30} value={p.drive.deviceName} placeholder={p.drive.autoDevice} onChange={(e) => p.drive.setDeviceName(e.target.value)} />
                  </label>
                </Line>
                <button type="button" className="fold" data-testid="drive-refresh" aria-expanded={driveOpen} disabled={p.drive.busy && !p.drive.list}
                  onClick={() => { if (!driveOpen && !p.drive.list) p.drive.onRefresh(); setDriveOpen(!driveOpen); }}>
                  <span className="fold-arrow" aria-hidden="true">{driveOpen ? '▾' : '▸'}</span>
                  {t('Drive-এর ব্যাকআপগুলো')}
                  {p.drive.list && <small> · {t('{n}টা', { n: p.drive.list.length })}</small>}
                </button>
                {driveOpen && p.drive.list && (
                  p.drive.list.length === 0 ? <p className="muted">{t('Drive-এ এখনো কোনো ব্যাকআপ নেই')}</p> : (
                    <ul className="itemlist" data-testid="drive-list">
                      {p.drive.list.map((b) => (
                        <li key={b.id} className="drive-item">
                          <span>{formatDateTime(Date.parse(b.createdTime), p.uiLang)}
                            <small className="drive-meta">
                              {b.appProperties?.device && <b className={b.appProperties.device === p.drive.thisDevice ? 'here' : ''}>{b.appProperties.device}{b.appProperties.device === p.drive.thisDevice ? ' (' + t('এই ডিভাইস') + ')' : ''}</b>}
                              {b.appProperties?.device && b.size ? ' · ' : ''}
                              {b.size && <>{num(Math.max(1, Math.round(Number(b.size) / 1024)), p.uiLang)} KB</>}
                            </small></span>
                          <button type="button" className="btn small" title={t('ডিভাইসে নামান')} aria-label={t('ডিভাইসে নামান')} data-testid={'drive-download-' + b.id} onClick={() => p.drive.onDownload(b)}>⤓</button>
                          <ArmedButton label={t('ফেরত আনুন')} armedLabel={t('নিশ্চিত?')} testid={'drive-restore-' + b.id} onConfirm={() => p.drive.onRestore(b)} />
                          <ArmedButton label="🗑" armedLabel={t('মুছবেন?')} testid={'drive-delete-' + b.id} onConfirm={() => p.drive.onDelete(b)} />
                        </li>
                      ))}
                    </ul>
                  )
                )}
                <div className="row drive-foot">
                  <button type="button" className="btn ghost" data-testid="drive-disconnect" onClick={p.drive.onDisconnect}>{t('Google Drive থেকে বিচ্ছিন্ন করুন')}</button>
                </div>
              </>
            )}
          </Group>
          <Group title={t('অফলাইন ও ইনস্টল')}>
            <Line info={p.app.persisted ? 'স্থায়ী স্টোরেজ: চালু — ব্রাউজার নিজে থেকে এই সাইটের লেখা ও সেটিং মুছবে না।' : 'স্থায়ী স্টোরেজ: চালু নয় — জায়গা কমলে বা অনেকদিন না খুললে ব্রাউজার লেখা ও সেটিং মুছে দিতে পারে। নিয়মিত ব্যাকআপ নিন।'}>
              <span data-testid="persist-status" className={'state ' + (p.app.persisted ? 'ok' : 'warn')}>{p.app.persisted ? t('স্থায়ী স্টোরেজ: চালু') : t('স্থায়ী স্টোরেজ: চালু নয়')}</span>
              {!p.app.persisted && <button type="button" className="btn small" data-testid="persist" onClick={p.app.onPersist}>{t('স্থায়ী করার অনুমতি চান')}</button>}
            </Line>
            {!p.app.supported ? (
              <Line info="এই প্রিভিউতে অফলাইন ও ইনস্টল চলে না। নিজের https সাইটে বসানোর পর চলবে।"><span className="state warn" data-testid="app-status">{t('অফলাইন: এই প্রিভিউতে নেই')}</span></Line>
            ) : (
              <>
                <Line info={p.app.offlineReady ? 'অফলাইন: চালু। একবার খোলার পর ইন্টারনেট ছাড়াও লেখা, সেভ, Word ফাইল ও প্রিন্ট চলবে (সরাসরি ভয়েস বাদে)।' : 'অফলাইন কপি তৈরি হচ্ছে… একবার পুরো লোড হলে ইন্টারনেট ছাড়াও চলবে।'}>
                  <span className={'state ' + (p.app.offlineReady ? 'ok' : 'warn')} data-testid="app-status">{p.app.offlineReady ? t('অফলাইন: চালু') : t('অফলাইন কপি তৈরি হচ্ছে…')}</span>
                </Line>
                {p.app.standalone ? (
                  <p className="muted">{t('হোম স্ক্রিনের অ্যাপ হিসেবে চলছে।')}</p>
                ) : p.app.apple ? (
                  <Line info="Safari আর হোম স্ক্রিনের অ্যাপের ডেটা আলাদা থাকে, তাই আগে Safari থেকে ব্যাকআপ নিয়ে অ্যাপে ফেরত আনুন।">
                    <span data-testid="install-howto">{t('ইনস্টল')}: Share (⬆︎) → Add to Home Screen → Add</span>
                  </Line>
                ) : p.app.canInstall ? (
                  <div className="row"><button type="button" className="btn primary" data-testid="install" onClick={p.app.onInstall}>{t('ProNotes ইনস্টল করুন')}</button></div>
                ) : (
                  <Line info="ইনস্টল: ব্রাউজারের ঠিকানার ঘরের ইনস্টল আইকন, বা মেনু → “Install ProNotes / Add to Home screen”।"><span className="muted">{t('ইনস্টল: ব্রাউজারের মেনু থেকে')}</span></Line>
                )}
                <Line info="নতুন ভার্সন এলে উপরে জানানো হবে; আপনি “আপডেট করুন” চাপলে লেখা সেভ করে তবেই আপডেট হবে।">
                  <button type="button" className="btn" data-testid="check-update" onClick={p.app.onCheckUpdate}>{t('নতুন ভার্সন আছে কিনা দেখুন')}</button>
                </Line>
              </>
            )}
          </Group>
          <p className="muted"><a href="./license.html" target="_blank" rel="noopener" data-testid="license-link">{t('লাইসেন্স ও ব্যবহারের শর্ত')}</a> · {en ? '© 2026 Mahbubur Rahman' : '© ২০২৬ মাহবুবুর রহমান'}</p>
        </>
      )}
      </div>
    </section>
  );
}

type SettingsTab = 'type' | 'voice' | 'font' | 'words' | 'app';
const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'type', label: 'লেখা' },
  { id: 'voice', label: 'ভয়েস ও AI' },
  { id: 'font', label: 'ফন্ট ও বিজয়' },
  { id: 'words', label: 'শব্দ' },
  { id: 'app', label: 'অ্যাপ' },
];

/** ⓘ: the explanation stays folded until asked for (Bangla source text; translated here). */
function InfoButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={'info-btn' + (open ? ' on' : '')} aria-expanded={open} aria-label={t('ব্যাখ্যা')} title={t('ব্যাখ্যা')} data-testid="info" onClick={onClick}>i</button>
  );
}
function InfoText({ text, vars }: { text: string; vars?: Record<string, string | number> }) {
  const { t } = useT();
  return <p className="info-text" data-testid="info-text">{t(text, vars)}</p>;
}

/** A titled block of settings, with its ⓘ next to the title. */
/**
 * A Settings group. With `fold` it can be closed to one line (decisions.md 78): the title, a short
 * status (e.g. when the last backup was made) and ▸/▾; whether it is open is kept on this device only.
 */
function Group({ title, info, children, fold }: { title: string; info?: string; children: ReactNode; fold?: { id: string; summary?: ReactNode } }) {
  const [open, setOpen] = useState(false);
  const foldKey = fold ? 'device.fold.' + fold.id : '';
  const [unfolded, setUnfolded0] = useState<boolean>(() => (fold ? load(foldKey, false) : true));
  const setUnfolded = (v: boolean) => { setUnfolded0(v); if (fold) save(foldKey, v); };
  return (
    <section className={'sgroup' + (fold ? ' foldable' + (unfolded ? ' open' : '') : '')}>
      <div className="sgroup-head">
        {fold ? (
          <button type="button" className="sgroup-fold" data-testid={fold.id + '-fold'} aria-expanded={unfolded} onClick={() => setUnfolded(!unfolded)}>
            <span className="fold-arrow" aria-hidden="true">{unfolded ? '▾' : '▸'}</span>
            <h3>{title}</h3>
            {!unfolded && fold.summary && <small className="fold-summary">{fold.summary}</small>}
          </button>
        ) : <h3>{title}</h3>}
        {info && (!fold || unfolded) && <InfoButton open={open} onClick={() => setOpen(!open)} />}
      </div>
      {open && info && (!fold || unfolded) && <InfoText text={info} />}
      {unfolded && children}
    </section>
  );
}

/** One row of controls with an ⓘ at its end. */
function Line({ info, children }: { info?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sline">
      <div className="sline-row">{children}{info && <InfoButton open={open} onClick={() => setOpen(!open)} />}</div>
      {open && info && <InfoText text={info} />}
    </div>
  );
}

/** A switch row: short name, the box at the end, the longer explanation behind ⓘ. */
function Check(p: { testid: string; checked: boolean; onChange: (v: boolean) => void; label: string; info?: string; infoVars?: Record<string, string | number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sline">
      <div className="sline-row">
        <label className="srow chk"><span>{p.label}</span><input type="checkbox" data-testid={p.testid} checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} /></label>
        {p.info ? <InfoButton open={open} onClick={() => setOpen(!open)} /> : <span className="info-gap" aria-hidden="true" />}
      </div>
      {open && p.info && <InfoText text={p.info} vars={p.infoVars} />}
    </div>
  );
}

/** "✓ সংরক্ষিত" for a moment after any setting is saved (settings save at once; this makes it visible). */
function SavedLine() {
  const { t } = useT();
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let tm = 0;
    const on = () => {
      setFlash(true);
      clearTimeout(tm);
      tm = window.setTimeout(() => setFlash(false), 1800);
    };
    window.addEventListener('pronotes-saved', on);
    return () => { window.removeEventListener('pronotes-saved', on); clearTimeout(tm); };
  }, []);
  return (
    <p className={'saved-line' + (flash ? ' on' : '')} data-testid="settings-saved" role="status">
      {flash ? t('✓ সংরক্ষিত') : t('কিছু বদলালে সাথে সাথে এই ডিভাইসে সংরক্ষিত হয় — আলাদা Save লাগে না।')}
    </p>
  );
}

const SAMPLE_BIJOY = toBijoy('আমার সোনার বাংলা');
/** "Regular", "Bold", "Italic", "Bold Italic" (as fonts name their styles). */
function styleName(f: { italic?: boolean; weight?: number }): string {
  const bold = (f.weight ?? 400) >= 600;
  return bold && f.italic ? 'Bold Italic' : bold ? 'Bold' : f.italic ? 'Italic' : 'Regular';
}
