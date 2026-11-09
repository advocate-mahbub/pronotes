import { useEffect, useRef, useState } from 'react';
import { toBijoy } from '../bijoy';
import { DEFAULT_FORMAT, type DocFormat } from '../docx-export/format';
import { ENGLISH_FONTS, LOCAL_ANSI, LOCAL_UNI, WEB_FONTS, isFontAvailable } from '../fonts';
import { TOGGLE_KEYS, ANSI_KEYS, type Layout, type ToggleKey, type AnsiKey } from '../bornona-engine';
import type { VoicePrefs } from './prefs-types';
import { useT, type UiLang } from '../i18n';

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
  setVoiceEngine: (v: 'auto' | 'ai' | 'device') => void;
}

export interface AiSettings {
  key: string;
  setKey: (k: string) => void;
  model: string;
  setModel: (m: string) => void;
  privateWords: string[];
  setPrivateWords: (w: string[]) => void;
}

/** Gemini key (hidden), model and a test button. */
function AiKeyBox({ ai }: { ai: AiSettings }) {
  const { t } = useT();
  const [k, setK] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const fetchModels = async () => {
    setStatus(t('দেখা হচ্ছে…'));
    try {
      const { geminiModels } = await import('../ai/gemini');
      const list = await geminiModels(ai.key);
      setModels(list);
      setStatus(t('key ঠিক আছে; {n}টা মডেল পাওয়া গেল', { n: list.length }));
    } catch (e) {
      setStatus((e as { code?: string }).code === 'key' ? t('key ঠিক নেই') : (e as { code?: string }).code === 'network' ? t('ইন্টারনেট নেই') : t('যাচাই করা গেল না'));
    }
  };
  return (
    <>
      {ai.key ? (
        <div className="row">
          <span data-testid="ai-key-set">{t('key রাখা আছে')} (…{ai.key.slice(-4)})</span>
          <button type="button" className="btn small" data-testid="ai-key-test" onClick={fetchModels}>{t('key যাচাই ও মডেল তালিকা')}</button>
          <button type="button" className="btn small" data-testid="ai-key-del" onClick={() => { ai.setKey(''); setStatus(''); setModels([]); }}>{t('key মুছুন')}</button>
        </div>
      ) : (
        <>
        <details className="key-guide" data-testid="ai-key-guide" open>
          <summary>{t('Gemini key কোথায় পাব? (ধাপে ধাপে)')}</summary>
          <ol>
            <li>{t('নিচের বাটনে Google AI Studio খুলুন, নিজের Google (Gmail) অ্যাকাউন্টে ঢুকুন।')}</li>
            <li>{t('প্রথমবার শর্তে রাজি হলে Google নিজেই একটা প্রজেক্ট আর key বানিয়ে দেয়; না দিলে "Create API key" চাপুন।')}</li>
            <li>{t('key-এর পাশে "Unrestricted" লেখা থাকলে "Add restrictions" → "Restrict to Gemini API only" → "Restrict key" চাপুন। Google এখন বাধাহীন key নেয় না।')}</li>
            <li>{t('key কপি করে নিচের ঘরে পেস্ট করুন, "রাখুন" চাপুন, তারপর "key যাচাই"।')}</li>
          </ol>
          <a className="btn small" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" data-testid="ai-key-studio">{t('Google AI Studio খুলুন ↗')}</a>
          <p className="note">{t('Billing চালু করবেন না — তাহলে খরচ হয় না, শুধু দিনের সীমা থাকে। key পাসওয়ার্ডের মতো: কাউকে দেবেন না; ফাঁস হলে AI Studio-তে নতুন key বানিয়ে পুরোনোটা মুছে দিন।')}</p>
          <p className="note">{t('key শুধু এই ডিভাইসে থাকে, ব্যাকআপে যায় না। অন্য ডিভাইসে আলাদা করে দিতে হবে।')}</p>
        </details>
        <div className="row">
          <input type="password" autoComplete="off" data-testid="ai-key-in" value={k} onChange={(e) => setK(e.target.value)} placeholder="AIza…" />
          <button type="button" className="btn small" data-testid="ai-key-save" disabled={!k.trim()} onClick={() => { ai.setKey(k); setK(''); }}>{t('রাখুন')}</button>
        </div>
        </>
      )}
      <label>{t('মডেল')}
        <input data-testid="ai-model" list="ai-models" value={ai.model} onChange={(e) => ai.setModel(e.target.value.trim())} />
        <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      {status && <p className="note" data-testid="ai-key-status">{status}</p>}
    </>
  );
}

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

/** Hidden file input + button. */
function FileButton(p: { label: string; accept: string; testid: string; onFile: (f: File) => void; primary?: boolean }) {
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
  const { t } = useT();
  const uniFonts = p.fonts.filter((f) => f.role === 'uni');
  const ansiFonts = p.fonts.filter((f) => f.role === 'ansi');
  const here = (name: string, ansi = false) => p.fonts.some((f) => f.family === name) || WEB_FONTS.includes(name) || isFontAvailable(name, ansi);
  const pageFonts = [...new Set([...LOCAL_UNI, ...WEB_FONTS, ...uniFonts.map((f) => f.family), p.format.font])];
  const ansiChoices = [...new Set([...LOCAL_ANSI, ...ansiFonts.map((f) => f.family)])];
  const sv = (patch: Partial<VoicePrefs>) => p.setVoice({ ...p.voice, ...patch });
  const [withKey, setWithKey] = useState(false);
  // families that have only italic or bold files: normal text would be drawn slanted or heavy
  const noRegular = [...new Set(p.fonts.map((f) => f.family))].filter((fam) => !p.fonts.some((f) => f.family === fam && !f.italic && (f.weight ?? 400) < 600));

  return (
    <section className="settings" aria-label={t('সেটিংস')} data-testid="settings-panel">
      <SavedLine />
      <details open>
        <summary>{t('কিবোর্ড ও টাইপিং')}</summary>
        <h3 className="sub-h">{t('কিবোর্ড লেআউট')}</h3>
        <p className="note">{t('অন্য কোনো Avro লেআউট (.avrolayout) ব্যবহার করতে চাইলে ফাইলটা যোগ করুন। এটা শুধু এই ডিভাইসে থাকে (ব্যাকআপে যায়)।')}</p>
        <div className="row">
          <FileButton label={t('লেআউট যোগ করুন (.avrolayout)')} accept=".avrolayout,.xml,text/xml" testid="layout-add" onFile={p.onAddLayout} />
        </div>
        {p.customLayouts.length > 0 && (
          <ul className="itemlist" data-testid="layout-list">
            {p.customLayouts.map((l) => (
              <li key={l.id}>
                <span>{l.name}</span><small>{(l.dev || '').slice(0, 30)}</small>
                <ArmedButton label={t('মুছুন')} armedLabel={t('নিশ্চিত?')} testid={'layout-del-' + l.id} onConfirm={() => p.onDeleteLayout(l.id)} />
              </li>
            ))}
          </ul>
        )}
        <h3 className="sub-h">{t('শর্টকাট key')}</h3>
        <div className="grid2">
          <label>{t('বাংলা ⇄ English বদল')}
            <select data-testid="toggle-key" value={p.toggleKey} onChange={(e) => p.setToggleKey(e.target.value as ToggleKey)}>
              {TOGGLE_KEYS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label>{t('ইউনিকোড ⇄ ANSI বদল')}
            <select data-testid="ansi-key" value={p.ansiKey} onChange={(e) => p.setAnsiKey(e.target.value as AnsiKey)}>
              {ANSI_KEYS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
            </select>
          </label>
        </div>
        <p className="note">{t('iPad-এ Ctrl+Space অনেক সময় iPad নিজেই ভাষা বদলাতে নিয়ে নেয়; তখন F12 বা Ctrl+M বেছে নিন। ফিজিক্যাল কিবোর্ডেই কাজ করে; অন-স্ক্রিন কিবোর্ডে EN/বাং বাটন আছে।')}</p>
        <h3 className="sub-h">{t('টাইপিং-এর ধরন')}</h3>
        <p className="note">{t('ProNotes নির্দিষ্ট লেআউটে (Fixed Keyboard Layout) আধুনিক ধরনে টাইপ করে: কার সবসময় ব্যঞ্জনবর্ণের পরে চাপতে হয়।')}</p>
        <label><input type="checkbox" data-testid="oldreph" checked={p.oldReph} onChange={(e) => p.setOldReph(e.target.checked)} /> {t('বিজয়-ধাঁচের রেফ: বর্ণ লেখার পরে রেফ চাপুন (ক ম রেফ লিখলে হবে কর্ম)')}</label>
        <label><input type="checkbox" data-testid="vf" checked={p.vf} onChange={(e) => p.setVf(e.target.checked)} /> {t('স্বর-গঠন: শব্দের শুরুতে বা স্বরবর্ণের পরে কার চাপুন (ি চাপলে হবে ই, ে চাপলে এ, অ-এর পরে া চাপলে আ)')}</label>
        <p className="note">{t('Bornona-য় ই, উ, এ, ও-এর আলাদা key নেই, তাই এটা চালু রাখতে হয়। যে লেআউটে পূর্ণ স্বরবর্ণের আলাদা key আছে (যেমন National, Probhat), সেখানে চাইলে বন্ধ রাখতে পারেন।')}</p>
        <h3 className="sub-h">{t('বিজয় (ANSI)-তে টাইপ (পরীক্ষামূলক)')}</h3>
        <label><input type="checkbox" data-testid="ansi-typing" checked={p.ansiTyping} onChange={(e) => p.setAnsiTyping(e.target.checked)} /> {t('বাংলা লেখা সরাসরি বিজয় ANSI-তে (SutonnyMJ) রাখো')}</label>
        <p className="note">{t('শুধু পুরোনো SutonnyMJ ফাইলে কপি-পেস্ট করার জন্য। এই অবস্থায় শব্দের পরামর্শ, শেখা, কথা বলে লেখা আর খোঁজা ঠিকমতো কাজ করে না, আর ফন্ট না থাকলে লেখা ভাঙা দেখায়। সাধারণ কাজে ইউনিকোডে লিখে “কপি: ANSI” বা বিজয় Word ফাইল নেওয়াই ভালো। পরে Converter → “পুরো ড্রাফট ইউনিকোডে” দিয়ে ফেরানো যায়।')}</p>
        <label><input type="checkbox" data-testid="fix-chandra" checked={p.fixChandra} onChange={(e) => p.setFixChandra(e.target.checked)} /> {t('চন্দ্রবিন্দুর জায়গা নিজে থেকে ঠিক করো (ক ঁ া লিখলে হবে কাঁ)')}</label>
      </details>

      <details>
        <summary>{t('ভয়েস টাইপিং')}</summary>
        <label>{t('মাইক বোতাম কোন ভয়েসে চলবে')}
          <select data-testid="voice-engine" value={p.voiceEngine} onChange={(e) => p.setVoiceEngine(e.target.value as 'auto' | 'ai' | 'device')}>
            <option value="auto">{t('নিজে থেকে: Gemini key থাকলে AI, না থাকলে ডিভাইসের')}</option>
            <option value="ai">{t('AI ভয়েস (Gemini) — বাংলায় ভালো, key লাগে')}</option>
            <option value="device">{t('ডিভাইস/ব্রাউজারের ভয়েস')}</option>
          </select>
        </label>
        <p className="note">{t('key ছাড়া বিকল্প (পরখ করে দেখুন): Google-এর ফ্রি Gboard কিবোর্ড অ্যাপ বসিয়ে বাংলা যোগ করুন, ProNotes-এ লেখার সময় সেই কিবোর্ডের মাইক চাপুন। ফোনের নিজের কিবোর্ডে যা আসে, ProNotes-এ সরাসরি বসে। Apple-এর নিজের ডিকটেশনে বাংলা আছে বলে নিশ্চিত হওয়া যায়নি।')}</p>
        <div className="grid2">
          <label>{t('ভাষা')}
            <select data-testid="vlang" value={p.voice.lang} onChange={(e) => sv({ lang: e.target.value })}>
              <option value="auto">{t('লেখার মোড অনুযায়ী (বাংলা / English)')}</option>
              <option value="bn-BD">{t('বাংলা (বাংলাদেশ)')}</option>
              <option value="bn-IN">{t('বাংলা (ভারত)')}</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-IN">English (India)</option>
            </select>
          </label>
        </div>
        <label><input type="checkbox" data-testid="vcmd" checked={p.voice.commands} onChange={(e) => sv({ commands: e.target.checked })} /> {t('বলা যতিচিহ্ন বসাও (দাঁড়ি, কমা, নতুন লাইন)')}</label>
        <label><input type="checkbox" data-testid="vdig" checked={p.voice.banglaDigits} onChange={(e) => sv({ banglaDigits: e.target.checked })} /> {t('ভয়েসের সংখ্যা বাংলায় লেখো (১২৩)')}</label>
        <label className="stack" htmlFor="corr">{t('ভয়েসের ভুল সংশোধন')}</label>
        <p className="note">{t('প্রতি লাইনে একটা: ভুল = ঠিক। যেমন: এক্তিয়ার = এখতিয়ার')}</p>
        <textarea id="corr" data-testid="corr" spellCheck={false} placeholder={t('এক্তিয়ার = এখতিয়ার')} value={p.corrections} onChange={(e) => p.setCorrections(e.target.value)} />
        <p className="note">{t(p.voiceNote)}</p>
        <p className="note">{t('সরাসরি ভয়েসে কথা ব্রাউজারের ভয়েস সার্ভিসে (Chrome-এ Google) যায়; মক্কেলের গোপন তথ্য কিবোর্ডে লিখুন। প্রথমবার মাইক চাপলে এই সতর্কবার্তা একবার দেখানো হয়।')}</p>
      </details>

      <details>
        <summary>{t('ফন্ট')}</summary>
        <h3 className="sub-h">{t('ড্রাফটের ডিফল্ট ফন্ট (পর্দা, Word ফাইল ও প্রিন্ট)')}</h3>
        <div className="grid2">
          <label>{t('বাংলা ড্রাফট')}
            <select data-testid="fmt-font" value={p.format.font} onChange={(e) => p.setFormat({ ...p.format, font: e.target.value })}>
              {pageFonts.map((f) => <option key={f} value={f}>{f + (here(f) ? '' : ' ' + t('(এই ডিভাইসে নেই)'))}</option>)}
            </select>
          </label>
          <label>{t('English ড্রাফট')}
            <select data-testid="fmt-font-en" value={p.format.fontEn} onChange={(e) => p.setFormat({ ...p.format, fontEn: e.target.value })}>
              {[...new Set([p.format.fontEn, ...ENGLISH_FONTS])].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label>{t('মূল লেখা (pt)')}
            <input type="number" min={8} max={40} step={0.5} data-testid="fmt-size" value={p.format.size} onChange={(e) => p.setFormat({ ...p.format, size: Number(e.target.value) || DEFAULT_FORMAT.size })} />
          </label>
          <label>{t('বড় শিরোনাম (pt)')}
            <input type="number" min={8} max={60} step={0.5} data-testid="fmt-title" value={p.format.titleSize} onChange={(e) => p.setFormat({ ...p.format, titleSize: Number(e.target.value) || DEFAULT_FORMAT.titleSize })} />
          </label>
          <label>{t('লাইন স্পেসিং')}
            <select data-testid="fmt-line" value={p.format.lineSpacing} onChange={(e) => p.setFormat({ ...p.format, lineSpacing: Number(e.target.value) })}>
              <option value={1}>1.0</option><option value={1.15}>1.15</option><option value={1.5}>1.5</option><option value={2}>2.0</option>
            </select>
          </label>
        </div>
        <p className="note">{t('ফন্ট এই ডিভাইসে না থাকলে পর্দায় অন্য ফন্টে দেখাবে, কিন্তু Word ফাইলে নাম এটাই থাকবে; যে কম্পিউটারে ফাইলটা খুলবেন সেখানে ফন্টটা থাকলেই হবে। কাগজ ও মার্জিন এখন রিবনের “পাতা” ট্যাবে।')}</p>
        <h3 className="sub-h">{t('নিজের ফন্ট ফাইল')}</h3>
        <p className="note">{t('যে ফন্ট এই ডিভাইসে নেই (যেমন iPad-এ SutonnyOMJ), তার ফাইল (.ttf, .otf, .woff) যোগ করুন, তাহলে পর্দায় সেই ফন্টেই দেখাবে। ফাইলটা শুধু এই ডিভাইসে থাকে, ব্যাকআপে যায় না।')}</p>
        <div className="row">
          <FileButton label={t('ইউনিকোড ফন্ট যোগ করুন')} accept={FONT_ACCEPT} testid="font-add-uni" onFile={(f) => p.onAddFont(f, 'uni')} />
          <FileButton label={t('বিজয় (ANSI) ফন্ট যোগ করুন')} accept={FONT_ACCEPT} testid="font-add-ansi" onFile={(f) => p.onAddFont(f, 'ansi')} />
        </div>
        {p.fonts.length > 0 && (
          <>
          {noRegular.length > 0 && (
            <p className="note warn" data-testid="font-no-regular">{t('{f}: শুধু Italic/Bold ফাইল আছে, সাধারণ (Regular) ফাইল নেই — তাই সাধারণ লেখাও বাঁকা বা মোটা দেখাবে। Regular ফাইলটা যোগ করুন।', { f: noRegular.join(', ') })}</p>
          )}
          <ul className="itemlist" data-testid="font-list">
            {p.fonts.map((f) => (
              <li key={f.id}>
                {/* the name in the app's font; the sample in the font itself (Bijoy-encoded for ANSI, so it reads as Bangla) */}
                <span className="fl-name">{f.family} <small>{styleName(f)}</small></span>
                <span className="fl-sample" style={{ fontFamily: `"${f.family}", var(--f-sans)`, fontStyle: f.italic ? 'italic' : 'normal', fontWeight: f.weight ?? 400 }}>{f.role === 'ansi' ? SAMPLE_BIJOY : 'আমার সোনার বাংলা'}</span>
                <small>{f.role === 'ansi' ? 'ANSI' : t('ইউনিকোড')}</small>
                <ArmedButton label={t('মুছুন')} armedLabel={t('নিশ্চিত?')} testid={'font-del-' + f.id} onConfirm={() => p.onDeleteFont(f.id)} />
              </li>
            ))}
          </ul>
          </>
        )}
        <div className="grid2">
          <label>{t('বিজয় লেখা দেখার ফন্ট')}
            <select data-testid="ansi-font" value={p.ansiFont} onChange={(e) => p.setAnsiFont(e.target.value)}>
              <option value="">{t('ফন্ট ছাড়া (ইংরেজি অক্ষরে দেখাবে)')}</option>
              {ansiChoices.map((n) => <option key={n} value={n}>{n + (here(n, true) ? '' : ' ' + t('(এই ডিভাইসে নেই)'))}</option>)}
            </select>
          </label>
          <label>{t('Word-এ বিজয় লেখার ইংরেজি অংশ')}
            <select data-testid="en-font" value={p.enFont} onChange={(e) => p.setEnFont(e.target.value)}>
              {ENGLISH_FONTS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </details>

      <details>
        <summary>{t('ইউনিকোড ⇄ বিজয়')}</summary>
        <label><input type="checkbox" data-testid="auto-bijoy" checked={p.autoBijoy} onChange={(e) => p.setAutoBijoy(e.target.checked)} /> {t('বিজয় লেখা পেস্ট করলে নিজে থেকে ইউনিকোডে বদলাও')}</label>
        <p className="note">{t('Word থেকে কপি করলে শুধু SutonnyMJ-জাতীয় ফন্টের অংশ বদলায়, ইংরেজি অংশ যেমন আছে থাকে। টুলস ট্যাবের Converter-এ দুই দিকের রূপান্তর আছে।')}</p>
      </details>

      <details>
        <summary>{t('শব্দভান্ডার')}</summary>
        <label className="chk"><input type="checkbox" data-testid="dict-on" checked={p.dict.on} onChange={(e) => p.dict.setOn(e.target.checked)} /> {t('বাংলা অভিধানের শব্দও পরামর্শে দেখাও')}</label>
        <p className="note" data-testid="dict-status">{p.dict.on ? (p.dict.count ? t('অভিধান: {n}টা শব্দ (উৎস: bangla-spellcheck-dict)। আপনার নিজের শব্দ সবসময় আগে আসে; দুই অক্ষর লেখার পর অভিধানের শব্দ আসে।', { n: p.dict.count.toLocaleString('bn-BD') }) : t('অভিধান লোড হচ্ছে…')) : t('অভিধান বন্ধ: শুধু আপনার শেখা শব্দ ও আইনি শব্দ।')}</p>
        <p className="note" data-testid="word-count">{t('শেখা শব্দ: {n}টা। বর্ণনা প্যাড (v8)-এর এক্সপোর্ট করা ফাইলও এখানে ইমপোর্ট করা যায়।', { n: p.wordCount })}</p>
        <div className="row">
          <button type="button" className="btn" data-testid="learn-doc" onClick={p.onLearnDoc}>{t('এই ড্রাফট থেকে শব্দ শিখুন')}</button>
          <button type="button" className="btn" data-testid="words-export" onClick={p.onExportWords}>{t('এক্সপোর্ট')}</button>
          <FileButton label={t('ইমপোর্ট')} accept=".json,application/json" testid="words-import" onFile={p.onImportWords} />
          <ArmedButton label={t('শেখা শব্দ মুছুন')} armedLabel={t('আবার চাপলে মুছে যাবে')} testid="words-reset" onConfirm={p.onResetWords} />
        </div>
        <p className="note">{t('মোছার আগে এক্সপোর্ট করে রাখুন; মুছলে ফেরত আনা যায় না।')}</p>
      </details>

      <details>
        <summary>{t('AI সহকারী')}</summary>
        <p className="note" data-testid="ai-note">{t('দুইভাবে চলে: (১) আপনার Claude সাবস্ক্রিপশন — ProNotes লেখা কপি করে দেয়, আপনি Claude অ্যাপে পেস্ট করে উত্তর এনে দেন; ProNotes নিজে কিছু পাঠায় না। (২) Gemini-র ফ্রি API key দিলে এখান থেকেই চলে, প্রতিবার জিজ্ঞেস করে। দুই ক্ষেত্রেই নাম, দাগ, দলিল নম্বর, ফোন আগে লুকানো হয় আর উত্তরে ফিরে আসে।')}</p>
        <h3 className="sub-h">{t('Gemini (ফ্রি, ঐচ্ছিক)')}</h3>
        <p className="note" data-testid="ai-voice-note">{t('এই key দিয়ে ✦ AI ভয়েস টাইপিংও চলে: লেখার পাতার ডান-নিচে ✦ চাপুন, বলুন, আবার ✦ চাপুন। বাংলার জন্য ডিভাইসের নিজের ভয়েসের চেয়ে ভালো লেখে; অডিও Google-এ যায় (প্রথমবার জিজ্ঞেস করে)।')}</p>
        <p className="note">{t('aistudio.google.com থেকে নিজের Google account দিয়ে ফ্রি API key নিন। ফ্রি key-তে Google পাঠানো লেখা তাদের সেবা উন্নত করতে ব্যবহার করতে পারে, তাই মক্কেলের আসল তথ্য কখনো পাঠাবেন না। key শুধু এই ডিভাইসে থাকে, ব্যাকআপ ফাইলে যায় না।')}</p>
        <AiKeyBox ai={p.ai} />
        <h3 className="sub-h">{t('সবসময় লুকানো শব্দ')}</h3>
        <p className="note">{t('যে নাম/শব্দগুলো AI-তে পাঠানোর আগে সবসময় লুকানো হবে (এই ডিভাইসে থাকে)।')}</p>
        <ul className="itemlist" data-testid="ai-words">
          {p.ai.privateWords.map((w) => (
            <li key={w}><span>{w}</span><button type="button" className="btn small" onClick={() => p.ai.setPrivateWords(p.ai.privateWords.filter((x) => x !== w))}>{t('বাদ দিন')}</button></li>
          ))}
        </ul>
        <p className="note">{t('Claude API (টাকা দিয়ে key) পরে যোগ হবে।')}</p>
      </details>

      <details>
        <summary>{t('অ্যাপ: মেনুর ভাষা, অফলাইন, ইনস্টল')}</summary>
        <div className="ui-lang">
          <span>{t('মেনুর ভাষা')}</span>
          <div className="seg small" role="group" aria-label={t('মেনুর ভাষা')}>
            <button type="button" aria-pressed={p.uiLang === 'bn'} data-testid="ui-bn" onClick={() => p.setUiLang('bn')}>বাংলা</button>
            <button type="button" aria-pressed={p.uiLang === 'en'} data-testid="ui-en" onClick={() => p.setUiLang('en')}>English</button>
          </div>
        </div>
        <p className="note">{t('শুধু মেনু ও বাটনের লেখা বদলায়। টাইপিং-এর ভাষা (উপরের বা/e বোতাম) আর ডকুমেন্ট আলাদা।')}</p>
        <p className="note" data-testid="persist-status">
          {p.app.persisted ? t('স্থায়ী স্টোরেজ: চালু — ব্রাউজার নিজে থেকে এই সাইটের লেখা ও সেটিং মুছবে না।') : t('স্থায়ী স্টোরেজ: চালু নয় — জায়গা কমলে বা অনেকদিন না খুললে ব্রাউজার লেখা ও সেটিং মুছে দিতে পারে। নিয়মিত ব্যাকআপ নিন।')}
          {!p.app.persisted && <> <button type="button" className="btn small" data-testid="persist" onClick={p.app.onPersist}>{t('স্থায়ী করার অনুমতি চান')}</button></>}
        </p>
        <p className="note"><a href="./license.html" target="_blank" rel="noopener" data-testid="license-link">{t('লাইসেন্স ও ব্যবহারের শর্ত')}</a> · © ২০২৬ মাহবুবুর রহমান</p>
        {!p.app.supported ? (
          <p className="note" data-testid="app-status">{t('এই প্রিভিউতে অফলাইন ও ইনস্টল চলে না। নিজের https সাইটে বসানোর পর চলবে।')}</p>
        ) : (
          <>
            <p className="note" data-testid="app-status">
              {p.app.offlineReady ? t('অফলাইন: চালু। একবার খোলার পর ইন্টারনেট ছাড়াও লেখা, সেভ, Word ফাইল ও প্রিন্ট চলবে (সরাসরি ভয়েস বাদে)।') : t('অফলাইন কপি তৈরি হচ্ছে… একবার পুরো লোড হলে ইন্টারনেট ছাড়াও চলবে।')}
            </p>
            {p.app.standalone ? (
              <p className="note">{t('হোম স্ক্রিনের অ্যাপ হিসেবে চলছে।')}</p>
            ) : p.app.apple ? (
              <p className="note" data-testid="install-howto">{t('iPad/iPhone-এ ইনস্টল: Safari-তে এই পাতা খুলে')} <b>Share</b> (⬆︎) → <b>Add to Home Screen</b> → <b>Add</b>{t('। তারপর হোম স্ক্রিনের ProNotes আইকন থেকে খুলুন। খেয়াল রাখুন: Safari আর হোম স্ক্রিনের অ্যাপের ডেটা আলাদা থাকে, তাই আগে Safari থেকে ব্যাকআপ নিয়ে অ্যাপে ফেরত আনুন।')}</p>
            ) : p.app.canInstall ? (
              <div className="row"><button type="button" className="btn primary" data-testid="install" onClick={p.app.onInstall}>{t('ProNotes ইনস্টল করুন')}</button></div>
            ) : (
              <p className="note">{t('ইনস্টল: ব্রাউজারের ঠিকানার ঘরের ইনস্টল আইকন, বা মেনু → “Install ProNotes / Add to Home screen”।')}</p>
            )}
            <div className="row"><button type="button" className="btn" data-testid="check-update" onClick={p.app.onCheckUpdate}>{t('নতুন ভার্সন আছে কিনা দেখুন')}</button></div>
            <p className="note">{t('নতুন ভার্সন এলে উপরে জানানো হবে; আপনি “আপডেট করুন” চাপলে লেখা সেভ করে তবেই আপডেট হবে।')}</p>
          </>
        )}
      </details>

      <details>
        <summary>{t('ব্যাকআপ')}</summary>
        {p.ai.key && (
          <label className="chk"><input type="checkbox" data-testid="backup-key" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> {t('Gemini key-ও ব্যাকআপে রাখুন (ফাইলটা তখন পাসওয়ার্ডের মতো গোপনে রাখবেন)')}</label>
        )}
        <p className="note">{t('সব ড্রাফট (ট্র্যাশসহ), শেখা শব্দ, নিজের লেআউট, ভয়েসের সংশোধন আর সেটিংস একটা ফাইলে (ফন্ট ফাইল বাদে)। iPad-এ ফাইলটা Files বা iCloud Drive-এ রাখুন। ফেরত আনলে আগের কিছু মুছবে না; বদলে যাওয়া ড্রাফট আলাদা কপি হয়ে আসবে।')}</p>
        <div className="row">
          <button type="button" className="btn primary" data-testid="backup" onClick={() => p.onBackup(withKey)}>{t('সব কিছুর ব্যাকআপ নিন')}</button>
          <FileButton label={t('ব্যাকআপ থেকে ফেরত আনুন')} accept=".json,application/json" testid="restore" onFile={p.onRestore} />
        </div>
      </details>
    </section>
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
