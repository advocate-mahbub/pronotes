/**
 * Title chart (chain of title) data, in the owner's own format (his court charts): the CS/SA/RS owners,
 * then every step — inheritance (heirs with their relation), deeds (no., date, kind, area, buyer), a merge
 * of what one person got from several sources, and boxed notes (a suit, a wrong record).
 * The drawing (layout.ts, svg.ts) is made from this data. Areas and shares are checked where they are given:
 * heirs' shares adding to 1, nobody giving more land than they got.
 */

/* ---------- exact fractions (hissa: 1/3, 2/7 … must not drift like decimals) ---------- */

export interface Frac { n: bigint; d: bigint }
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
export const frac = (n: bigint | number, d: bigint | number = 1n): Frac => {
  let N = BigInt(n), D = BigInt(d);
  if (D === 0n) throw new Error('division by zero');
  if (D < 0n) { N = -N; D = -D; }
  const g = gcd(N, D);
  return { n: N / g, d: D / g };
};
export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const cmp = (a: Frac, b: Frac) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
export const ZERO = frac(0);
export const ONE = frac(1);
export const isZero = (a: Frac) => a.n === 0n;

const ascii = (s: string) => s.replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
/** "1/3", "2", "0.0825", "৮.২৫" or "৮.২৫শ" → exact fraction; null when it is not a number. */
export function readFrac(s: string | undefined): Frac | null {
  if (!s) return null;
  const t = ascii(s).trim().replace(/\s*(শতক|শতাংশ|শ\.?)$/, '');
  const m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return frac(BigInt(m[1]), BigInt(m[2]));
  const d = t.match(/^(\d*)(?:\.(\d+))?$/);
  if (!d || (!d[1] && !d[2])) return null;
  const decs = d[2] ?? '';
  return frac(BigInt((d[1] || '0') + decs), 10n ** BigInt(decs.length));
}
export function parseFrac(s: string): Frac {
  const v = readFrac(s);
  if (!v) throw new Error('not a number: ' + s);
  return v;
}

/** Decimal with up to `places` digits (শতক is written with 4: অযুতাংশ), trailing zeros dropped. */
export function toDecimal(a: Frac, places = 4): string {
  const neg = a.n < 0n;
  const scale = 10n ** BigInt(places);
  let q = ((neg ? -a.n : a.n) * scale * 2n + a.d) / (2n * a.d);
  const int = q / scale;
  q %= scale;
  const f = q.toString().padStart(places, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + int.toString() + (f ? '.' + f : '');
}
export const fracText = (a: Frac) => (a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`);
export const bnDigits = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

/* ---------- the chart ---------- */

export type Survey = 'CS' | 'SA' | 'RS' | 'BS' | 'PS' | 'City' | 'Diara';

export interface Person { id: string; name: string }

/** Someone receiving land in a step: relation over the name (স্ত্রী, পুত্র …), area/share and small lines under it. */
export interface Receiver {
  person: string;
  /** Written above the name: স্ত্রী, পুত্র, কন্যা, মাতা, চাচা, "৪পুত্র" … */
  relation?: string;
  /** Share of the giver's land (1/8, 7/40); used for the check and, with no area, to work the area out. */
  share?: string;
  /** Area received, as written (৪৬.৮১, ২৩.৪০); "শ" is added when drawn. */
  area?: string;
  /** Extra small lines: "সিটি রেকর্ডীয় মালিক", "সিটি দাগ নং ৬০১" … */
  lines?: string[];
}

interface StepBase { id: string }
export type Step =
  /** The first recorded owners (CS …): each starts a branch. */
  | (StepBase & { kind: 'record'; survey: Survey; owners: (Receiver & { label?: string })[]; boxed?: boolean })
  /** Death: everything the deceased holds goes to the heirs. */
  | (StepBase & { kind: 'inheritance'; deceased: string; heirs: Receiver[] })
  /** A deed from one or more givers to one or more buyers. With one buyer the deed and the buyer are one block. */
  | (StepBase & { kind: 'deed'; no: string; date?: string; type?: string; area?: string; from: string[]; to: Receiver[]; lines?: string[] })
  /** One person's land from several sources, brought together ("ওয়ারিশ ও খরিদসূত্রে মালিক"). */
  | (StepBase & { kind: 'merge'; person: string; caption?: string; lines?: string[] })
  /** A boxed note in the chain (a suit, a wrong record): the land of `through` passes through it. */
  | (StepBase & { kind: 'note'; lines: string[]; through: string[] });

export interface TitleChart {
  /** Lines over the chart (court, case number). */
  heading?: string[];
  persons: Person[];
  steps: Step[];
  /** One person ringed (e.g. the record owner the case is about): step id + person. */
  highlight?: { step: string; person: string };
  /** Text under the chart (the argument). */
  notes?: string[];
  /** "Research & Prepared By" block. */
  preparedBy?: string[];
}

/* ---------- checking the chain ---------- */

export interface Problem { step: string; text: string }

/** Checks every step where the numbers are given: heirs' shares add to 1, nobody gives more than they got. */
export function check(chart: TitleChart): { problems: Problem[]; held: Map<string, Frac | null> } {
  const held = new Map<string, Frac | null>(); // null: not known (no area written)
  const problems: Problem[] = [];
  const name = (id: string) => chart.persons.find((p) => p.id === id)?.name ?? id;
  const give = (id: string, a: Frac | null) => {
    const cur = held.has(id) ? held.get(id)! : ZERO;
    held.set(id, cur === null || a === null ? null : add(cur, a));
  };
  for (const s of chart.steps) {
    if (s.kind === 'record') for (const o of s.owners) give(o.person, readFrac(o.area));
    else if (s.kind === 'inheritance') {
      const left = held.get(s.deceased) ?? null;
      const shares = s.heirs.map((h) => readFrac(h.share));
      if (shares.every(Boolean)) {
        const total = shares.reduce<Frac>((a, b) => add(a, b!), ZERO);
        if (cmp(total, ONE) !== 0) problems.push({ step: s.id, text: `${name(s.deceased)}-এর ওয়ারিশদের অংশ যোগ করে ${bnDigits(fracText(total))}, ১ নয়` });
      }
      let given = ZERO;
      s.heirs.forEach((h, i) => {
        const a = readFrac(h.area) ?? (left && shares[i] ? mul(left, shares[i]!) : null);
        if (a) given = add(given, a);
        give(h.person, a);
      });
      if (left && s.heirs.every((h) => readFrac(h.area)) && cmp(given, left) > 0)
        problems.push({ step: s.id, text: `${name(s.deceased)}-এর ${bnDigits(toDecimal(left))} শতক, ওয়ারিশদের মোট ${bnDigits(toDecimal(given))} শতক` });
      held.set(s.deceased, ZERO);
    } else if (s.kind === 'deed') {
      const area = readFrac(s.area);
      const have = s.from.map((p) => held.get(p) ?? null);
      if (area && have.every((h): h is Frac => h !== null)) {
        const total = (have as Frac[]).reduce(add, ZERO);
        if (cmp(area, total) > 0) problems.push({ step: s.id, text: `দলিল ${bnDigits(s.no)}: ${s.from.map(name).join(', ')}-এর ${bnDigits(toDecimal(total))} শতক, দলিলে ${bnDigits(toDecimal(area))} শতক` });
      }
      // what the givers had goes down by the deed's area (or becomes unknown)
      for (const p of s.from) {
        const h = held.get(p) ?? null;
        held.set(p, s.from.length === 1 && h && area ? sub(h, area) : null);
      }
      const each = area ? frac(area.n, area.d * BigInt(s.to.length)) : null;
      for (const t of s.to) give(t.person, readFrac(t.area) ?? each);
    }
  }
  return { problems, held };
}
