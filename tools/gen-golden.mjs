// Records the behaviour of reference/bornona-pad-v8.html into tests/golden/*.json.
// The new modules are tested against these files, so v8 stays the yardstick.
// Run: npm run golden   (needs Playwright Chromium)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ref = 'file://' + path.join(root, 'reference/bornona-pad-v8.html');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'tools/golden-cases.json'), 'utf8'));
const out = (name, data) => fs.writeFileSync(path.join(root, 'tests/golden', name), JSON.stringify(data, null, 1) + '\n');

const CODES = ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal',
  'KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash',
  'KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote',
  'KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'];
const NUMPAD = ['Numpad0','Numpad1','Numpad5','Numpad9','NumpadAdd','NumpadSubtract','NumpadMultiply','NumpadDivide','NumpadDecimal'];
const LAYERS = [['normal',''],['shift','Shift+'],['alt','Alt+'],['shiftAlt','Shift+Alt+']];

const browser = await chromium.launch();
async function freshPage() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(ref);
  await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById('setBox').open = true; });
  p._errs = errs;
  return p;
}
async function setOpts(p, { layout, vf, oldReph }) {
  await p.evaluate(({ layout, vf, oldReph }) => {
    const s = document.getElementById('layoutSel'); s.value = layout; s.dispatchEvent(new Event('change'));
    const v = document.getElementById('vf'); v.checked = vf; v.dispatchEvent(new Event('change'));
    const o = document.getElementById('oldReph'); o.checked = oldReph; o.dispatchEvent(new Event('change'));
  }, { layout, vf, oldReph });
}
const clear = p => p.evaluate(() => { const t = document.getElementById('ta'); t.value = ''; t.focus(); t.setSelectionRange(0, 0); });
const val = p => p.$eval('#ta', t => t.value);

// 1. every key, every layer, every built-in layout (vowel forming off)
const layoutsSrc = fs.readFileSync(path.join(root, 'reference/bornona-pad-v8.html'), 'utf8');
const layouts = JSON.parse(layoutsSrc.match(/const BUILTIN_LAYOUTS=(\[.*?\]);\nlet MAP=/s)[1]);
out('layouts.json', layouts);
let p = await freshPage();
const keys = {};
for (const L of layouts) {
  await setOpts(p, { layout: L.id, vf: false, oldReph: false });
  keys[L.id] = {};
  for (const code of [...CODES, ...NUMPAD]) {
    keys[L.id][code] = {};
    for (const [name, mod] of LAYERS) {
      if (code.startsWith('Numpad') && name !== 'normal') continue;
      await clear(p);
      await p.keyboard.press(mod + code);
      keys[L.id][code][name] = await val(p);
    }
  }
}
out('keys.json', keys);

// 2. sequences (vowel forming / reph behaviour)
const seqs = [];
for (const s of cases.sequences) {
  await setOpts(p, s);
  await clear(p);
  for (const k of s.keys) await p.keyboard.press(k);
  seqs.push({ ...s, output: await val(p) });
}
out('sequences.json', seqs);

// 3. Bijoy: every Bangla word of the lexicon + samples
const bijoy = await p.evaluate((c) => {
  const B = window.BornonaBijoy;
  const fix = s => s.replace(/য়/g, 'য়').replace(/ড়/g, 'ড়').replace(/ঢ়/g, 'ঢ়');
  const src = [LEX_BN_LEGAL, LEX_BN_COMMON, SEED_PHRASES].join('|');
  const words = [...new Set(src.match(/[ঀ-৿‌‍]+/g))].map(fix);
  const enc = [...words, ...c.bijoySamples].map(u => ({ u, b: B.toBijoy(u), back: B.toUnicode(B.toBijoy(u)) }));
  const dec = c.bijoyDecodeSamples.map(b => ({ b, u: B.toUnicode(b) }));
  const looks = [...c.bijoyDecodeSamples, ...c.mixedSamples, 'The plaintiff filed the suit on 5 May 2024.'].map(s => ({ s, v: B.looksBijoy(s) }));
  return { enc, dec, looks };
}, cases);
out('bijoy.json', bijoy);

// 4. mixed runs (via the converter panel) and Word-style HTML paste
const runs = [];
for (const s of cases.mixedSamples) {
  await p.evaluate((s) => { const t = document.getElementById('ta'); t.value = s; t.setSelectionRange(s.length, s.length);
    document.getElementById('conv').hidden = false; document.getElementById('toBj').click(); }, s);
  await p.waitForTimeout(50);
  runs.push({ s, runs: await p.$$eval('#bjOut span', sp => sp.map(x => ({ en: x.className === 'en', text: x.textContent }))) });
}
const pastes = [];
for (const h of cases.htmlPasteSamples) {
  await p.evaluate((h) => { const t = document.getElementById('ta'); t.value = ''; t.focus();
    const dt = new DataTransfer(); dt.setData('text/plain', 'x'); dt.setData('text/html', h);
    t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
  pastes.push({ html: h, value: await val(p) });
}
out('bijoy-ui.json', { runs, pastes });

// 5. suggestions: empty word bank, then after learning a text
const sugAt = async (text) => {
  await p.evaluate((text) => { const t = document.getElementById('ta'); t.value = text; t.focus(); t.setSelectionRange(text.length, text.length); t.dispatchEvent(new Event('keyup')); }, text);
  return p.$$eval('#sug .chip', c => c.map(x => x.textContent));
};
await p.close();
p = await freshPage();
await setOpts(p, { layout: 'bornona', vf: true, oldReph: false });
const fresh = {};
for (const pre of cases.suggestPrefixes) fresh[pre] = await sugAt(pre);
await p.evaluate((t) => { const ta = document.getElementById('ta'); ta.value = t; document.getElementById('learnAll').click(); }, cases.learnText);
const learned = {};
for (const pre of [...cases.suggestPrefixes, 'মষ', 'মষক ', 'আপত্তিকারী ']) learned[pre] = await sugAt(pre);
const lex = await p.evaluate(() => new Promise(r => setTimeout(() => r(JSON.parse(localStorage.getItem('bornona.lex'))), 700)));
out('suggest.json', { fresh, learnText: cases.learnText, learned, lex });

// 6. voice text clean-up (v8 cleanVoice / putVoice; the speech engine itself is not involved).
// v8 keeps them inside its main closure, so a temporary copy exposes them on window.__voice.
const hooked = layoutsSrc.replace('function putVoice(raw){',
  "window.__voice={cleanVoice,putVoice,st,reset:()=>{lastFinal='';lastFinalAt=0}};function putVoice(raw){");
if (hooked === layoutsSrc) throw new Error('voice hook point not found in v8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pronotes-golden-')), 'v8-voice.html');
fs.writeFileSync(tmp, hooked);
await p.goto('file://' + tmp);
await p.waitForTimeout(300);
const voice = await p.evaluate((c) => {
  const V = window.__voice, st = V.st;
  const ta = document.getElementById('ta');
  const clean = [];
  for (const [vcmd, vdig] of [[true, true], [true, false], [false, true]]) {
    for (const corr of ['', c.voiceCorr]) {
      st.vcmd = vcmd; st.vdig = vdig; st.corr = corr;
      for (const [raw, lang] of c.voiceRaw) clean.push({ raw, lang, vcmd, vdig, corr, out: V.cleanVoice(raw, lang) });
    }
  }
  st.vcmd = true; st.vdig = true; st.corr = '';
  const put = [];
  for (const [before, raw, lang] of c.voicePut) {
    st.vlang = lang; ta.value = before; ta.focus(); ta.setSelectionRange(before.length, before.length);
    V.reset();
    V.putVoice(raw);
    put.push({ before, raw, lang, value: ta.value });
  }
  // the same final result twice within 2.5 s is inserted once
  st.vlang = 'bn-BD'; ta.value = ''; V.reset();
  V.putVoice('আমি'); V.putVoice('আমি');
  const dedupe = ta.value;
  st.vlang = 'auto';
  return { clean, put, dedupe };
}, cases);
out('voice.json', voice);
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

const errs = p._errs;
await browser.close();
if (errs.length) { console.error('page errors:', errs); process.exit(1); }
console.log('golden files written:', fs.readdirSync(path.join(root, 'tests/golden')).join(', '));
