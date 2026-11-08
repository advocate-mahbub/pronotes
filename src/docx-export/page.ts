/**
 * Page setup of one document (paper, orientation, margins, document language, page numbers).
 * All lengths in twips (1440 = 1 inch), the unit Word uses.
 */
export type PaperId = 'legal' | 'folio' | 'a4' | 'env-dl' | 'env-10' | 'env-c5' | 'custom';
/** Direction of the text on the paper: normal, turned to read top → bottom, or bottom → top (envelopes fed narrow side first). */
export type TextDir = 'lr' | 'tb' | 'bt';
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
  /** Text direction on the paper (missing = normal). Margins stay as the text is read. */
  textDir?: TextDir;
}

const MM = 1440 / 25.4;
export const mm = (v: number) => Math.round(v * MM);

export const PAPERS: Record<Exclude<PaperId, 'custom'>, { label: string; width: number; height: number }> = {
  legal: { label: 'Legal (8.5 × 14")', width: 12240, height: 20160 },
  folio: { label: 'Folio (210 × 330 mm)', width: mm(210), height: mm(330) },
  a4: { label: 'A4 (210 × 297 mm)', width: mm(210), height: mm(297) },
  'env-dl': { label: 'খাম DL (110 × 220 mm)', width: mm(110), height: mm(220) },
  'env-10': { label: 'খাম #10 (4⅛ × 9½")', width: 5940, height: 13680 },
  'env-c5': { label: 'খাম C5 (162 × 229 mm)', width: mm(162), height: mm(229) },
};
export const isEnvelope = (id: PaperId) => id.startsWith('env-');
/** Papers offered in the menus (owner's choice: one envelope, #10). DL and C5 stay readable for drafts that already use them. */
export const PAPER_MENU: Exclude<PaperId, 'custom'>[] = ['legal', 'folio', 'a4', 'env-10'];
export const paperChoices = (current: PaperId): Exclude<PaperId, 'custom'>[] =>
  current !== 'custom' && !PAPER_MENU.includes(current) ? [...PAPER_MENU, current] : PAPER_MENU;

/** An envelope: landscape, small margins, no page numbers. */
export function envelopePage(paper: 'env-dl' | 'env-10' | 'env-c5' = 'env-dl'): PageSetup {
  return {
    ...DEFAULT_PAGE,
    paper,
    width: PAPERS[paper].width,
    height: PAPERS[paper].height,
    orientation: 'landscape',
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
    pageNumbers: { ...DEFAULT_PAGE.pageNumbers, show: false },
    textDir: 'lr',
  };
}

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

/**
 * The paper as it goes through the printer. With turned text (envelope fed narrow side first)
 * the paper is upright and the margins are turned with the text.
 */
export function physicalPage(p: PageSetup): { w: number; h: number; margins: PageSetup['margins']; landscape: boolean } {
  const { w, h } = pageSize(p);
  const m = p.margins;
  if (!p.textDir || p.textDir === 'lr') return { w, h, margins: m, landscape: p.orientation === 'landscape' };
  // text read with width w, height h; paper is h wide and w tall
  const margins = p.textDir === 'tb'
    ? { top: m.left, right: m.top, bottom: m.right, left: m.bottom }
    : { top: m.right, right: m.bottom, bottom: m.left, left: m.top };
  return { w: h, h: w, margins, landscape: false };
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
