/**
 * Text converters for legal drafting: amount in words (Bangla and English, lakh/crore),
 * Bangla ⇄ English digits, South Asian digit grouping, and repair of broken Bangla text
 * (copied from PDFs or old software).
 */
import { fixNukta } from '../bornona-engine';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
export const toEnDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Bangla number words 0–99 (Bangla Academy spellings). */
export const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'অষ্টাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

const EN_0_19 = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const en99 = (n: number) => (n < 20 ? EN_0_19[n] : EN_TENS[Math.floor(n / 10)] + (n % 10 ? '-' + EN_0_19[n % 10] : ''));

/**
 * Whole number in words with the South Asian system (crore, lakh, thousand, hundred).
 * Above 99 crore the crore part is itself read out ("এক শত কোটি").
 */
export function numberInWords(n: number, lang: 'bn' | 'en'): string {
  if (!Number.isFinite(n) || n < 0) throw new Error('not a positive number');
  n = Math.floor(n);
  const w99 = (x: number) => (lang === 'bn' ? BN_0_99[x] : en99(x));
  if (n === 0) return w99(0);
  const U = lang === 'bn' ? { crore: 'কোটি', lakh: 'লক্ষ', thousand: 'হাজার', hundred: 'শত' } : { crore: 'Crore', lakh: 'Lakh', thousand: 'Thousand', hundred: 'Hundred' };
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  let rest = n % 1e7;
  if (crore) parts.push(numberInWords(crore, lang) + ' ' + U.crore);
  const lakh = Math.floor(rest / 1e5);
  rest %= 1e5;
  if (lakh) parts.push(w99(lakh) + ' ' + U.lakh);
  const th = Math.floor(rest / 1000);
  rest %= 1000;
  if (th) parts.push(w99(th) + ' ' + U.thousand);
  const h = Math.floor(rest / 100);
  rest %= 100;
  if (h) parts.push(w99(h) + ' ' + U.hundred);
  if (rest) parts.push(w99(rest));
  return parts.join(' ');
}

/** 500000 → "5,00,000" (South Asian grouping). */
export function groupDigits(intPart: string): string {
  const s = intPart.replace(/^0+(?=\d)/, '');
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return head + ',' + last3;
}

/** Parse "5,00,000.50", "৫০০০০০", "5 00 000" → { taka, paisa }. */
export function parseAmount(input: string): { taka: number; paisa: number } | null {
  const s = toEnDigits(input).replace(/[,\s/-]|টাকা|tk\.?|taka/gi, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ''] = s.split('.');
  const taka = Number(i);
  if (!Number.isSafeInteger(taka)) return null;
  return { taka, paisa: d ? Number(d.padEnd(2, '0')) : 0 };
}

export interface AmountText {
  /** "পাঁচ লক্ষ" / "Five Lakh" */
  words: string;
  /** "পাঁচ লক্ষ টাকা মাত্র" / "Taka Five Lakh only" */
  withTaka: string;
  /** "৫,০০,০০০/- (পাঁচ লক্ষ) টাকা" / "Tk. 5,00,000/- (Taka Five Lakh only)" */
  deedStyle: string;
}

/** Amount in words in the forms used in plaints and deeds. */
export function amountInWords(input: string, lang: 'bn' | 'en'): AmountText | null {
  const a = parseAmount(input);
  if (!a) return null;
  const tw = numberInWords(a.taka, lang);
  const pw = a.paisa ? numberInWords(a.paisa, lang) : '';
  const fig = groupDigits(String(a.taka)) + (a.paisa ? '.' + String(a.paisa).padStart(2, '0') : '/-');
  if (lang === 'bn') {
    const words = tw + (pw ? ' টাকা ' + pw + ' পয়সা' : '');
    return {
      words,
      withTaka: tw + ' টাকা' + (pw ? ' ' + pw + ' পয়সা' : '') + ' মাত্র',
      deedStyle: toBnDigits(fig) + ' (' + words + ')' + (pw ? '' : ' টাকা'),
    };
  }
  const words = tw + (pw ? ' and Paisa ' + pw : '');
  return { words, withTaka: 'Taka ' + words + ' only', deedStyle: 'Tk. ' + fig + ' (Taka ' + words + ' only)' };
}

/* ---------- broken Bangla repair ---------- */

const CONS = '[ক-হড়ঢ়য়ৎ]';
const PREBASE = '[িেৈ]';
export interface FixReport {
  text: string;
  /** what was changed, for the user */
  changes: string[];
}

/**
 * Repairs common damage in Bangla text copied from PDFs or old software:
 * decomposed য়/ড়/ঢ়, vowel signs typed before their consonant (visual order: "েক" → "কে",
 * "েকা" → "কো"), "অা" → "আ", zero-width spaces and soft hyphens, "|" used as dari, repeated spaces.
 */
export function fixBrokenBangla(input: string, o: { pipeAsDari?: boolean } = {}): FixReport {
  const changes: string[] = [];
  let s = input;
  const step = (label: string, f: (x: string) => string) => {
    const n = f(s);
    if (n !== s) {
      changes.push(label);
      s = n;
    }
  };
  step('য়/ড়/ঢ় এক অক্ষরে', fixNukta);
  step('অদৃশ্য স্পেস ও soft hyphen বাদ', (x) => x.replace(/[​­﻿]/g, ''));
  step('অা → আ', (x) => x.replace(/অা/g, 'আ'));
  // ে + consonant cluster + া/ৗ → cluster + ো/ৌ (visual order from PDFs)
  step('আগে-বসা কার ঠিক জায়গায়', (x) =>
    x
      .replace(new RegExp(`(^|[^ক-হড়ঢ়য়্])ে(${CONS}(?:্${CONS})*)া`, 'g'), '$1$2ো')
      .replace(new RegExp(`(^|[^ক-হড়ঢ়য়্])ে(${CONS}(?:্${CONS})*)ৗ`, 'g'), '$1$2ৌ')
      .replace(new RegExp(`(^|[^ক-হড়ঢ়য়্])(${PREBASE})(${CONS}(?:্${CONS})*)`, 'g'), '$1$3$2'),
  );
  if (o.pipeAsDari) step('| → ।', (x) => x.replace(/([ঀ-৿])\s*\|/g, '$1।'));
  step('একাধিক স্পেস এক', (x) => x.replace(/[ \t]{2,}/g, ' '));
  return { text: s, changes };
}

/** Word, character and paragraph counts of a text. */
export function countText(s: string): { words: number; chars: number; charsNoSpace: number; paragraphs: number } {
  return {
    words: (s.match(/[^\s।,;:?!()"“”'‘’]+/g) || []).length,
    chars: [...s.replace(/\n/g, '')].length,
    charsNoSpace: [...s.replace(/\s/g, '')].length,
    paragraphs: s.split(/\n+/).filter((x) => x.trim()).length,
  };
}
