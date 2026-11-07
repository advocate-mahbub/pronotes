/**
 * Hide client details before text leaves the device, and put them back in the answer.
 *
 * Found automatically: names after titles and relation words (মোঃ, জনাব, পিতা: …), village/address
 * after সাং/গ্রাম/ঠিকানা, numbers of plots, khatians, deeds, cases, phones, NIDs, e-mails.
 * The user adds anything else (a name the rules miss) and can untick what need not be hidden.
 * Each different value gets its own placeholder like [ব্যক্তি-১]; the same value always gets the same one.
 * The map is kept in memory only and never saved.
 */

export type Kind = 'person' | 'place' | 'plot' | 'khatian' | 'deed' | 'case' | 'phone' | 'id' | 'email' | 'custom';

export const KIND_LABEL: Record<Kind, string> = {
  person: 'ব্যক্তি',
  place: 'ঠিকানা',
  plot: 'দাগ',
  khatian: 'খতিয়ান',
  deed: 'দলিল',
  case: 'মামলা',
  phone: 'ফোন',
  id: 'আইডি',
  email: 'ইমেইল',
  custom: 'গোপন',
};

export interface Finding {
  kind: Kind;
  value: string;
  /** on by default; the user may untick */
  on: boolean;
}

const BN_LETTER = '[\\u0980-\\u09FF]';
/** one Bangla or English name word (with inner dots: মোঃ, আঃ) */
const WORD = `(?:${BN_LETTER}+\\.?|[A-Z][a-zA-Z.]*)`;
const NAME = `${WORD}(?:[ \\t]+${WORD}){0,3}`;
const NUM = '[0-9০-৯][0-9০-৯/\\-,]*';

/** Words that end a name (so "মোঃ করিম গং" or "করিম, পিতা" stop at the right place). */
const STOP = /^(?:গং|এর|ও|এবং|বনাম|সাং|গ্রাম|থানা|জেলা|উপজেলা|পিতা|মাতা|স্বামী|স্ত্রী|দলিল|দাগ|খতিয়ান|মৌজা|নং|নম্বর|সাকিন|ডাকঘর|পোঃ|বাদী|বিবাদী|আসামী|দাতা|গ্রহীতা|son|of|vs|and|village|district)$/i;

const trimName = (s: string) => {
  const words = s.trim().replace(/^মৃত\s+/, '').split(/[ \t]+/);
  const out: string[] = [];
  for (const w of words) {
    if (STOP.test(w.replace(/[.,;:।]$/, ''))) break;
    out.push(w);
  }
  return out.join(' ').replace(/[,;:।]+$/, '').trim();
};

interface Rule {
  kind: Kind;
  re: RegExp;
  /** group with the value */
  g: number;
  clean?: (s: string) => string;
}

const RULES: Rule[] = [
  { kind: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]+/g, g: 0 },
  // Bangladeshi mobile numbers, with or without +88, in either digits
  { kind: 'phone', re: /(?:\+?(?:88|৮৮))?[0০][1১][3-9৩-৯][0-9০-৯]{8}/g, g: 0 },
  // NID / birth registration: 10, 13 or 17 digits after a label
  { kind: 'id', re: /(?:এনআইডি|জাতীয় পরিচয়পত্র|NID|জন্ম নিবন্ধন)[^0-9০-৯]{0,12}([0-9০-৯]{10}(?:[0-9০-৯]{3}){0,2}(?:[0-9০-৯]{4})?)/gi, g: 1 },
  { kind: 'plot', re: new RegExp(`(?:দাগ|Dag|Plot)\\s*(?:নং|নম্বর|No\\.?)?\\s*[:-]?\\s*(${NUM})`, 'gi'), g: 1 },
  { kind: 'khatian', re: new RegExp(`(?:খতিয়ান|Khatian)\\s*(?:নং|নম্বর|No\\.?)?\\s*[:-]?\\s*(${NUM})`, 'gi'), g: 1 },
  { kind: 'deed', re: new RegExp(`(?:দলিল|Deed)\\s*(?:নং|নম্বর|No\\.?)\\s*[:-]?\\s*(${NUM})`, 'gi'), g: 1 },
  { kind: 'case', re: new RegExp(`(?:মামলা|মোকদ্দমা|Suit|Case)\\s*(?:নং|নম্বর|No\\.?)\\s*[:-]?\\s*(${NUM})`, 'gi'), g: 1 },
  // number first: "১২৩৪ নং দাগ", "৫৬৭ নং খতিয়ান", "২৩৪৫/২০১০ নং দলিল", "১২ নং মামলা"
  { kind: 'plot', re: new RegExp(`(${NUM})\\s*(?:নং|নম্বর)\\s*(?:দাগ|দাগে)`, 'g'), g: 1 },
  { kind: 'khatian', re: new RegExp(`(${NUM})\\s*(?:নং|নম্বর)\\s*(?:খতিয়ান|খতিয়ানে)`, 'g'), g: 1 },
  { kind: 'deed', re: new RegExp(`(${NUM})\\s*(?:নং|নম্বর)\\s*(?:দলিল|কবলা|দানপত্র|হেবা)`, 'g'), g: 1 },
  { kind: 'case', re: new RegExp(`(${NUM})\\s*(?:নং|নম্বর)\\s*(?:মামলা|মোকদ্দমা|মিস|দেওয়ানি)`, 'g'), g: 1 },
  // names after titles and relation words
  {
    kind: 'person',
    re: new RegExp(`(?:^|[\\s(,])((?:মোঃ|মোহাম্মদ|মোছাঃ|মোসাম্মৎ|মোসাঃ|মৃত|জনাব|বেগম|মিসেস|ডাঃ|আলহাজ্ব|Md\\.|Mr\\.|Mrs\\.|Ms\\.)[ \\t]*${NAME})`, 'g'),
    g: 1,
    clean: trimName,
  },
  {
    kind: 'person',
    re: new RegExp(`(?:পিতা|মাতা|স্বামী|স্ত্রী|পিং|জং|Father|Husband|S/O|D/O|W/O)\\s*[:-]?\\s*(?:মৃত\\s+)?(${NAME})`, 'g'),
    g: 1,
    clean: trimName,
  },
  // village / address after সাং, গ্রাম, ঠিকানা
  {
    kind: 'place',
    re: new RegExp(`(?:সাং|সাকিন|গ্রাম|ঠিকানা|Village)\\s*[:-]?\\s*(${NAME})`, 'g'),
    g: 1,
    clean: trimName,
  },
];

const TITLES = /^(?:মোঃ|মোহাম্মদ|মোছাঃ|মোসাম্মৎ|মোসাঃ|মৃত|জনাব|বেগম|মিসেস|ডাঃ|আলহাজ্ব|Md\.|Mr\.|Mrs\.|Ms\.)\s*$/;

/** Details that look private in `text`, longest first, one entry per value. */
export function findPrivate(text: string, extra: string[] = []): Finding[] {
  const seen = new Map<string, Finding>();
  const add = (kind: Kind, v: string) => {
    v = v.trim();
    if (v.length < 2 || TITLES.test(v) || seen.has(v)) return;
    seen.set(v, { kind, value: v, on: true });
  };
  for (const x of extra) add('custom', x);
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      const raw = m[r.g];
      if (!raw) continue;
      add(r.kind, r.clean ? r.clean(raw) : raw.replace(/[,/-]+$/, ''));
    }
  }
  return [...seen.values()].sort((a, b) => b.value.length - a.value.length);
}

export interface Masked {
  text: string;
  /** placeholder → original value */
  map: Record<string, string>;
}

const BN_NUM = (n: number) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace every ticked finding with its placeholder. */
export function mask(text: string, findings: Finding[]): Masked {
  const map: Record<string, string> = {};
  const count: Partial<Record<Kind, number>> = {};
  let out = text;
  // longest first, so "মোঃ আব্দুল করিম" is replaced before "করিম"
  for (const f of [...findings].filter((x) => x.on).sort((a, b) => b.value.length - a.value.length)) {
    if (!out.includes(f.value)) continue;
    count[f.kind] = (count[f.kind] ?? 0) + 1;
    const ph = `[${KIND_LABEL[f.kind]}-${BN_NUM(count[f.kind]!)}]`;
    map[ph] = f.value;
    out = out.replace(new RegExp(esc(f.value), 'g'), ph);
  }
  return { text: out, map };
}

/**
 * Put the originals back. Tolerant of what AI models do to placeholders: changed brackets,
 * spaces inside, English digits ([ব্যক্তি-1]), or bold markers around them.
 */
export function unmask(text: string, map: Record<string, string>): { text: string; missing: string[] } {
  let out = text;
  const missing: string[] = [];
  for (const [ph, value] of Object.entries(map)) {
    const m = ph.match(/^\[(.+)-(.+)\]$/)!;
    const digits = m[2];
    const en = digits.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const re = new RegExp(`\\*{0,2}[\\[(【{]\\s*${esc(m[1])}\\s*[-–—_ ]\\s*(?:${esc(digits)}|${esc(en)})\\s*[\\])】}]\\*{0,2}`, 'g');
    if (!re.test(out)) missing.push(ph);
    out = out.replace(re, () => value);
  }
  return { text: out, missing };
}
