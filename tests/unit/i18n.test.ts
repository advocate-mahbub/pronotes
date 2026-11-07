import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EN } from '../../src/i18n/en';
import { translate } from '../../src/i18n';
import { ERRORS_FOR_I18N, decideVoice } from '../../src/voice';
import { PASTE_MSG_HTML, PASTE_MSG_TEXT } from '../../src/bijoy';
import { PARAGRAPH_STYLES } from '../../src/editor';
import { ANSI_KEYS } from '../../src/bornona-engine';
import { fixBrokenBangla } from '../../src/convert';

const BN = /[ঀ-৿]/;
const root = path.resolve(__dirname, '../../src');
const files = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));

/** Every Bangla string the interface can show: t('…'), say('…'), and messages built in other modules. */
export function uiKeys(): string[] {
  const keys = new Set<string>();
  const re = /\b(?:t|tr|say|sayIfIdle)\(\s*'((?:[^'\\]|\\.)*)'/g;
  for (const f of files(path.join(root, 'app'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) if (BN.test(m[1])) keys.add(m[1].replace(/\\'/g, "'"));
    // list items shown through t(x.label) / t(x.note), and the other branch of a message
    for (const m of src.matchAll(/\b(?:label|note):\s*'((?:[^'\\]|\\.)*)'/g)) if (BN.test(m[1])) keys.add(m[1]);
    for (const line of src.split('\n').filter((l) => /\b(?:say|t)\(/.test(l)))
      for (const m of line.matchAll(/[?:]\s*'((?:[^'\\]|\\.)*)'/g)) if (BN.test(m[1])) keys.add(m[1]);
    // object maps whose values are passed through t() (labels, status texts)
    for (const m of src.matchAll(/(?:LABEL|Label|statusText|themeLabel|LANG_NAMES)[^=]*=\s*(?:t\()?\{([^}]*)\}/g))
      for (const v of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (BN.test(v[1])) keys.add(v[1]);
  }
  for (const s of PARAGRAPH_STYLES) keys.add(s.label);
  for (const k of ANSI_KEYS) if (BN.test(k.label)) keys.add(k.label);
  for (const c of fixBrokenBangla('অামার ​েকাট  |', { pipeAsDari: true }).changes) keys.add(c);
  keys.add(fixBrokenBangla('য\u09BC').changes[0]);
  for (const m of [...ERRORS_FOR_I18N, PASTE_MSG_HTML, PASTE_MSG_TEXT]) keys.add(m);
  const env = { SR: null, isIOS: true, isAndroid: false, appleEngine: true, coarse: true, secure: true, preview: false };
  for (const e of [env, { ...env, coarse: false }, { ...env, isIOS: false }, { ...env, appleEngine: false, coarse: false }, { ...env, preview: true }, { ...env, preview: true, coarse: false }, { ...env, SR: (class {}) as never, appleEngine: false, secure: false }]) {
    const d = decideVoice('bn-BD', e);
    if (d.kind !== 'live') keys.add(d.message);
  }
  return [...keys];
}

describe('English interface', () => {
  it('every Bangla interface string has an English translation', () => {
    const missing = uiKeys().filter((k) => !(k in EN));
    if (missing.length) fs.writeFileSync(path.join(__dirname, '../../i18n-missing.json'), JSON.stringify(missing, null, 1));
    expect(missing).toEqual([]);
  });
  it('no translation is left in Bangla or loses a placeholder', () => {
    // these show Bangla letters as the example itself
    const KEEPS_BANGLA = /^(বাং|অা → আ|\| → ।|য়\/ড়\/ঢ় এক অক্ষরে)$|৫,০০,০০০|েক → কে/;
    for (const [bn, en] of Object.entries(EN)) {
      if (!KEEPS_BANGLA.test(bn)) expect(BN.test(en), en).toBe(false);
      for (const ph of bn.match(/\{\w+\}/g) || []) expect(en, bn).toContain(ph);
    }
  });
  it('placeholders get Bangla digits in Bangla and plain digits in English', () => {
    expect(translate('bn', 'আর {n} দিন', { n: 12 })).toBe('আর ১২ দিন');
    expect(translate('en', 'আর {n} দিন', { n: 12 })).toBe(EN['আর {n} দিন'].replace('{n}', '12'));
    expect(translate('en', 'অজানা বার্তা')).toBe('অজানা বার্তা');
  });
});
