/**
 * Page setup of one document (paper, orientation, margins, document language, page numbers).
 * All lengths in twips (1440 = 1 inch), the unit Word uses.
 */
export type PaperId = 'legal' | 'folio' | 'a4' | 'custom';
export type DocLang = 'bn' | 'en';

export interface PageSetup {
  paper: PaperId;
  /** Portrait width and height (orientation swaps them). */
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  /** Document language: paragraph numbers, page numbers and the default font follow it. */
  lang: DocLang;
  pageNumbers: { show: boolean; align: 'left' | 'center' | 'right'; style: 'full' | 'number' };
}

const MM = 1440 / 25.4;
export const mm = (v: number) => Math.round(v * MM);

export const PAPERS: Record<Exclude<PaperId, 'custom'>, { label: string; width: number; height: number }> = {
  legal: { label: 'Legal (8.5 × 14")', width: 12240, height: 20160 },
  folio: { label: 'Folio (210 × 330 mm)', width: mm(210), height: mm(330) },
  a4: { label: 'A4 (210 × 297 mm)', width: mm(210), height: mm(297) },
};

/** The owner's court drafts: top 3", right 1", bottom 1.5", left 1.5". */
export const COURT_MARGINS = { top: 4320, right: 1440, bottom: 2160, left: 2160 };
export const MARGIN_PRESETS: { id: string; label: string; m: PageSetup['margins'] }[] = [
  { id: 'court', label: 'আদালতের (উপরে ৩", বামে ১.৫", ডানে ১", নিচে ১.৫")', m: COURT_MARGINS },
  { id: 'normal', label: 'স্বাভাবিক (চারদিকে ১")', m: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  { id: 'narrow', label: 'সরু (চারদিকে ০.৫")', m: { top: 720, right: 720, bottom: 720, left: 720 } },
  { id: 'wide', label: 'চওড়া (উপর-নিচে ১", দুই পাশে ২")', m: { top: 1440, right: 2880, bottom: 1440, left: 2880 } },
];

export const DEFAULT_PAGE: PageSetup = {
  paper: 'legal',
  width: PAPERS.legal.width,
  height: PAPERS.legal.height,
  orientation: 'portrait',
  margins: COURT_MARGINS,
  lang: 'bn',
  pageNumbers: { show: true, align: 'right', style: 'full' },
};

/** Plain notes, when exported: A4 with 1" margins. */
export const NOTE_PAGE: PageSetup = { ...DEFAULT_PAGE, paper: 'a4', width: PAPERS.a4.width, height: PAPERS.a4.height, margins: MARGIN_PRESETS[1].m };

/** Header/footer distance from the paper edge (from the owner's draft). */
export const HEADER_DIST = 706;
export const FOOTER_DIST = 1440;

/** Fill in anything missing (older documents, partial objects). */
export function normalizePage(p?: Partial<PageSetup> | null, base: PageSetup = DEFAULT_PAGE): PageSetup {
  return {
    ...base,
    ...p,
    margins: { ...base.margins, ...(p?.margins ?? {}) },
    pageNumbers: { ...base.pageNumbers, ...(p?.pageNumbers ?? {}) },
  };
}

/** Width and height as printed (orientation applied). */
export function pageSize(p: PageSetup): { w: number; h: number } {
  return p.orientation === 'landscape' ? { w: p.height, h: p.width } : { w: p.width, h: p.height };
}

export const twToPx = (t: number) => t / 15;
export const twToIn = (t: number) => t / 1440;

const BN = '০১২৩৪৫৬৭৮৯';
export const digits = (n: number, lang: DocLang) => (lang === 'bn' ? String(n).replace(/\d/g, (d) => BN[Number(d)]) : String(n));

/** Paragraph number prefix: "১।" in Bangla documents, "1." in English ones. */
export const paraNumber = (n: number, lang: DocLang) => (lang === 'bn' ? digits(n, 'bn') + '।' : n + '.');

/**
 * Page-number text around the number fields. Decision #2: in Bangla drafts Word's PAGE field stays in
 * English digits; the label is Bangla.
 */
export function pageNumberParts(p: PageSetup): { before: string; between: string | null; after: string } {
  if (p.pageNumbers.style === 'number') return { before: '', between: null, after: '' };
  return p.lang === 'bn' ? { before: 'পাতা – ', between: '/', after: '' } : { before: 'Page ', between: ' of ', after: '' };
}
