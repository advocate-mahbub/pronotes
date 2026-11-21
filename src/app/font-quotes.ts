/**
 * Font samples (decisions.md 90): instead of one fixed line, every font shows a short verse of the Quran or a
 * hadith — the same font always the same one, so a list of fonts reads like a small collection. Bangla
 * fonts show the Bangla, Bijoy (ANSI) fonts the same text in Bijoy encoding, English fonts the English. The
 * list can be changed in Settings → ফন্ট ও বিজয় → ফন্টের নমুনা লেখা (saved with the settings and backups).
 * Samples stay in Bangla even with an English menu: they show the font, not the menu.
 */
import { useEffect, useState } from 'react';
import { load, save } from './prefs';

export interface Quote { bn: string; en: string; src: string; srcEn: string }
export const DEFAULT_QUOTES: Quote[] = [
  { bn: "আল্লাহ ছাড়া কোন মাবুদ নাই", en: "There is no god but Allah", src: "আল-কুরআন ৪৭:১৯", srcEn: "Quran 47:19" },
  { bn: "নিশ্চয়ই কষ্টের সাথে স্বস্তি আছে", en: "Indeed, with hardship comes ease", src: "আল-কুরআন ৯৪:৫–৬", srcEn: "Quran 94:5–6" },
  { bn: "নিশ্চয়ই আল্লাহ ধৈর্যশীলদের সাথে আছেন", en: "Indeed, Allah is with the patient", src: "আল-কুরআন ২:১৫৩", srcEn: "Quran 2:153" },
  { bn: "আল্লাহর রহমত থেকে নিরাশ হয়ো না", en: "Do not despair of the mercy of Allah", src: "আল-কুরআন ৩৯:৫৩", srcEn: "Quran 39:53" },
  { bn: "আল্লাহর স্মরণেই অন্তর প্রশান্তি পায়", en: "In the remembrance of Allah do hearts find rest", src: "আল-কুরআন ১৩:২৮", srcEn: "Quran 13:28" },
  { bn: "যে আল্লাহর ওপর ভরসা করে, তার জন্য তিনিই যথেষ্ট", en: "Whoever relies on Allah, He is sufficient for him", src: "আল-কুরআন ৬৫:৩", srcEn: "Quran 65:3" },
  { bn: "আল্লাহ কাউকে সাধ্যের অতিরিক্ত দায়িত্ব দেন না", en: "Allah does not burden a soul beyond its capacity", src: "আল-কুরআন ২:২৮৬", srcEn: "Quran 2:286" },
  { bn: "হে আমার রব, আমার জ্ঞান বাড়িয়ে দিন", en: "My Lord, increase me in knowledge", src: "আল-কুরআন ২০:১১৪", srcEn: "Quran 20:114" },
  { bn: "ন্যায়বিচার করো, এটাই তাকওয়ার নিকটতর", en: "Be just; that is nearer to righteousness", src: "আল-কুরআন ৫:৮", srcEn: "Quran 5:8" },
  { bn: "ন্যায়ের ওপর দৃঢ়ভাবে প্রতিষ্ঠিত থাকো", en: "Stand firmly for justice", src: "আল-কুরআন ৪:১৩৫", srcEn: "Quran 4:135" },
  { bn: "আমানত তার হকদারের কাছে পৌঁছে দাও", en: "Render trusts to whom they are due", src: "আল-কুরআন ৪:৫৮", srcEn: "Quran 4:58" },
  { bn: "সকল কাজ নিয়তের ওপর নির্ভরশীল", en: "Actions are judged by intentions", src: "সহীহ বুখারী ১; সহীহ মুসলিম ১৯০৭", srcEn: "Bukhari 1; Muslim 1907" },
  { bn: "পবিত্রতা ঈমানের অর্ধেক", en: "Purity is half of faith", src: "সহীহ মুসলিম ২২৩", srcEn: "Muslim 223" },
  { bn: "তোমাদের মধ্যে সর্বোত্তম সে, যে কুরআন শেখে ও শেখায়", en: "The best of you are those who learn the Quran and teach it", src: "সহীহ বুখারী ৫০২৭", srcEn: "Bukhari 5027" },
  { bn: "মুমিন এক গর্ত থেকে দুবার দংশিত হয় না", en: "A believer is not stung twice from the same hole", src: "সহীহ বুখারী ৬১৩৩; সহীহ মুসলিম ২৯৯৮", srcEn: "Bukhari 6133; Muslim 2998" },
  { bn: "তোমরা হীনবল হয়ো না, দুঃখিত হয়ো না", en: "Do not weaken and do not grieve", src: "আল-কুরআন ৩:১৩৯", srcEn: "Quran 3:139" },
  { bn: "নিশ্চয়ই আমি কাছেই আছি", en: "Indeed, I am near", src: "আল-কুরআন ২:১৮৬", srcEn: "Quran 2:186" },
  { bn: "কৃতজ্ঞ হলে আমি তোমাদের আরও দেব", en: "If you are grateful, I will surely give you more", src: "আল-কুরআন ১৪:৭", srcEn: "Quran 14:7" },
  { bn: "রব, তাঁদের প্রতি দয়া করুন, যেমন শৈশবে তাঁরা আমাকে লালন করেছেন", en: "My Lord, have mercy on them as they raised me when small", src: "আল-কুরআন ১৭:২৪", srcEn: "Quran 17:24" },
  { bn: "সত্য এসেছে, মিথ্যা বিলুপ্ত হয়েছে", en: "Truth has come and falsehood has vanished", src: "আল-কুরআন ১৭:৮১", srcEn: "Quran 17:81" },
  { bn: "সিদ্ধান্ত নিলে আল্লাহর ওপর ভরসা করো", en: "When you have decided, rely upon Allah", src: "আল-কুরআন ৩:১৫৯", srcEn: "Quran 3:159" },
  { bn: "আল্লাহর কাছে সবচেয়ে সম্মানিত সে, যে সবচেয়ে মুত্তাকী", en: "The most noble of you with Allah is the most righteous", src: "আল-কুরআন ৪৯:১৩", srcEn: "Quran 49:13" },
  { bn: "কোনো সংবাদ এলে যাচাই করে নাও", en: "If news comes to you, verify it", src: "আল-কুরআন ৪৯:৬", srcEn: "Quran 49:6" },
  { bn: "অধিকাংশ ধারণা থেকে বেঁচে থাকো", en: "Avoid much suspicion", src: "আল-কুরআন ৪৯:১২", srcEn: "Quran 49:12" },
  { bn: "তোমরা রবের কোন কোন নিয়ামত অস্বীকার করবে?", en: "Which of the favours of your Lord will you deny?", src: "আল-কুরআন ৫৫:১৩", srcEn: "Quran 55:13" },
  { bn: "আমাকে স্মরণ করো, আমিও তোমাদের স্মরণ করব", en: "Remember Me; I will remember you", src: "আল-কুরআন ২:১৫২", srcEn: "Quran 2:152" },
  { bn: "সৎকাজ ও তাকওয়ায় একে অপরকে সাহায্য করো", en: "Cooperate in righteousness and piety", src: "আল-কুরআন ৫:২", srcEn: "Quran 5:2" },
  { bn: "অন্যায়ভাবে একে অপরের সম্পদ গ্রাস কোরো না", en: "Do not consume one another's wealth unjustly", src: "আল-কুরআন ২:১৮৮", srcEn: "Quran 2:188" },
  { bn: "আল্লাহ ন্যায়বিচার ও সদাচারের নির্দেশ দেন", en: "Allah commands justice and good conduct", src: "আল-কুরআন ১৬:৯০", srcEn: "Quran 16:90" },
  { bn: "যে আল্লাহকে ভয় করে, তিনি তার জন্য পথ করে দেন", en: "Whoever fears Allah, He will make a way out for him", src: "আল-কুরআন ৬৫:২", srcEn: "Quran 65:2" },
  { bn: "দ্বীন হলো কল্যাণকামিতা", en: "The religion is sincere goodwill", src: "সহীহ মুসলিম ৫৫", srcEn: "Muslim 55" },
  { bn: "লজ্জা ঈমানের অংশ", en: "Modesty is part of faith", src: "সহীহ বুখারী ২৪", srcEn: "Bukhari 24" },
  { bn: "শক্তিশালী সে, যে রাগের সময় নিজেকে সামলায়", en: "The strong one controls himself when angry", src: "সহীহ বুখারী ৬১১৪; সহীহ মুসলিম ২৬০৯", srcEn: "Bukhari 6114; Muslim 2609" },
  { bn: "ভালো কথা বলো, নয়তো চুপ থাকো", en: "Speak good or remain silent", src: "সহীহ বুখারী ৬০১৮; সহীহ মুসলিম ৪৭", srcEn: "Bukhari 6018; Muslim 47" },
  { bn: "ভাইয়ের জন্য তা-ই চাও, যা নিজের জন্য চাও", en: "Love for your brother what you love for yourself", src: "সহীহ বুখারী ১৩; সহীহ মুসলিম ৪৫", srcEn: "Bukhari 13; Muslim 45" },
  { bn: "মুসলিম সে, যার জিহ্বা ও হাত থেকে অন্যরা নিরাপদ", en: "A Muslim is one from whose tongue and hand others are safe", src: "সহীহ বুখারী ১০", srcEn: "Bukhari 10" },
  { bn: "সহজ করো, কঠিন কোরো না", en: "Make things easy, not difficult", src: "সহীহ বুখারী ৬৯", srcEn: "Bukhari 69" },
  { bn: "উত্তম কথাও সদকা", en: "A good word is charity", src: "সহীহ বুখারী ২৯৮৯; সহীহ মুসলিম ১০০৯", srcEn: "Bukhari 2989; Muslim 1009" },
  { bn: "আল্লাহর কাছে প্রিয় আমল, যা নিয়মিত হয়, অল্প হলেও", en: "The deeds most loved by Allah are those done regularly, even if small", src: "সহীহ বুখারী ৬৪৬৪; সহীহ মুসলিম ৭৮৩", srcEn: "Bukhari 6464; Muslim 783" },
  { bn: "অর্থহীন বিষয় ছেড়ে দেওয়া ইসলামের সৌন্দর্য", en: "Leaving what does not concern him is part of a person's good Islam", src: "জামে তিরমিযী ২৩১৭", srcEn: "Tirmidhi 2317" },
  { bn: "তোমাদের প্রত্যেকেই দায়িত্বশীল", en: "Each of you is a shepherd and responsible for his flock", src: "সহীহ বুখারী ৮৯৩; সহীহ মুসলিম ১৮২৯", srcEn: "Bukhari 893; Muslim 1829" },
];
export interface QuotePrefs {
  /** rotate: each font its own quote; one: the first quote for every font. */
  mode: 'rotate' | 'one';
  /** null = the list above. */
  list: Quote[] | null;
}
const KEY = 'fontQuotes';
const EVENT = 'pn-font-quotes';
export const EMPTY_EN = 'Aa Bb 123';
export function loadQuotePrefs(): QuotePrefs {
  const v = load<Partial<QuotePrefs>>(KEY, {});
  return { mode: v.mode === 'one' ? 'one' : 'rotate', list: Array.isArray(v.list) && v.list.length ? v.list : null };
}
export function saveQuotePrefs(p: QuotePrefs): void {
  save(KEY, p);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}
export const quoteList = (p: QuotePrefs): Quote[] => p.list ?? DEFAULT_QUOTES;

/** A stable number for a font name, so a font keeps its quote. */
export function fontSeed(name: string): number {
  let h = 2166136261;
  for (const c of name.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g, '')) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return h >>> 0;
}
export function quoteFor(font: string, p: QuotePrefs): Quote {
  const list = quoteList(p);
  if (p.mode === 'one' || !font) return list[0];
  return list[fontSeed(font) % list.length];
}

export type SampleKind = 'uni' | 'ansi' | 'en';
/**
 * The sample for a font: Bangla, Bijoy-encoded Bangla, or English. An empty Bangla falls back to the first
 * quote's, an empty English to "Aa Bb 123". `bijoy` converts Unicode to Bijoy (given by the caller).
 */
export function sampleFor(font: string, kind: SampleKind, p: QuotePrefs, bijoy: (s: string) => string): { text: string; src: string; srcEn: string; q: Quote } {
  const q = quoteFor(font, p);
  const first = quoteList(p)[0];
  const bn = q.bn.trim() || first.bn.trim() || DEFAULT_QUOTES[0].bn;
  const text = kind === 'en' ? q.en.trim() || EMPTY_EN : kind === 'ansi' ? bijoy(bn) : bn;
  return { text, src: q.src, srcEn: q.srcEn, q };
}

/** The quote settings, kept up to date when they change anywhere in the app. */
export function useQuotePrefs(): QuotePrefs {
  const [p, setP] = useState(loadQuotePrefs);
  useEffect(() => {
    const on = () => setP(loadQuotePrefs());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return p;
}
