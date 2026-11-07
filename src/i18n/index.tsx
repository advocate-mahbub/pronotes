/**
 * App (interface) language. The Bangla text in the source is the key; en.ts maps it to English.
 * Document language and typing language are separate settings and never follow this one.
 */
import { createContext, useContext } from 'react';
import { EN } from './en';

export type UiLang = 'bn' | 'en';
type Vars = Record<string, string | number>;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnDigits = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

let current: UiLang = 'bn';
export const getUiLang = () => current;
export const setUiLangGlobal = (l: UiLang) => {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'en' ? 'en' : 'bn';
};

/** Translate a Bangla UI string. `{name}` placeholders take `vars`; numbers get Bangla digits in Bangla. */
export function translate(lang: UiLang, s: string, vars?: Vars): string {
  let out = lang === 'en' ? EN[s] ?? s : s;
  if (vars) {
    for (const k in vars) {
      const v = vars[k];
      const val = typeof v === 'number' ? (lang === 'bn' ? bnDigits(String(v)) : String(v)) : v;
      out = out.split('{' + k + '}').join(val);
    }
  }
  return out;
}

/** For code outside React (messages built in other modules). */
export const tr = (s: string, vars?: Vars) => translate(current, s, vars);

export type T = (s: string, vars?: Vars) => string;
export const I18nContext = createContext<{ lang: UiLang; t: T }>({ lang: 'bn', t: (s, v) => translate('bn', s, v) });
export const useT = () => useContext(I18nContext);

/** Date and time for lists and messages, in the interface language. */
export function formatDateTime(t: number, lang: UiLang = current): string {
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t));
  } catch {
    return new Date(t).toLocaleString();
  }
}
export const num = (n: number | string, lang: UiLang = current) => (lang === 'bn' ? bnDigits(String(n)) : String(n));
