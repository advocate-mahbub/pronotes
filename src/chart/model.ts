/**
 * Title chart (chain of title) data: one plot of land, its recorded owners in each survey (CS, SA, RS, BS…),
 * and every transfer since — deeds, inheritance, mutation. ProNotes replays the steps in order with exact
 * fractions, so the shares always add up and every owner's land is known at each step.
 * The drawing (layout.ts, svg.ts) is made from this data, never by hand.
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
export const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
export const cmp = (a: Frac, b: Frac) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
export const ZERO = frac(0);
export const ONE = frac(1);
export const isZero = (a: Frac) => a.n === 0n;

/** "1/3", "2", "0.0825" or "৮.২৫" → exact fraction. */
export function parseFrac(s: string): Frac {
  const t = s.trim().replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  const m = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (m) return frac(BigInt(m[1]), BigInt(m[2]));
  const d = t.match(/^(-?)(\d*)(?:\.(\d+))?$/);
  if (!d || (!d[2] && !d[3])) throw new Error('not a number: ' + s);
  const decs = d[3] ?? '';
  const v = frac(BigInt((d[1] || '') + (d[2] || '0') + decs), 10n ** BigInt(decs.length));
  return v;
}

/** Decimal with up to `places` digits (area in শতক is written with 4: অযুতাংশ), trailing zeros dropped. */
export function toDecimal(a: Frac, places = 4): string {
  const neg = a.n < 0n;
  const scale = 10n ** BigInt(places);
  // round half up
  let q = ((neg ? -a.n : a.n) * scale * 2n + a.d) / (2n * a.d);
  const int = q / scale;
  q %= scale;
  const frac = q.toString().padStart(places, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + int.toString() + (frac ? '.' + frac : '');
}
export const fracText = (a: Frac) => (a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`);

/* ---------- the chart ---------- */

export type Survey = 'CS' | 'SA' | 'RS' | 'BS' | 'PS' | 'City' | 'Diara';
export const SURVEYS: Survey[] = ['CS', 'SA', 'RS', 'BS', 'PS', 'City', 'Diara'];

export interface Person {
  id: string;
  name: string;
  /** পিতা/স্বামী, as the deed writes it. */
  relation?: string;
}

/** The land the chart is about. */
export interface Plot {
  district?: string;
  upazila?: string;
  mouza: string;
  jl?: string;
  /** Dag (plot) numbers by survey. */
  dag: Partial<Record<Survey, string>>;
  /** Area of the plot in শতক (decimal). */
  area: string;
}

export type DeedType = 'সাফ কবলা' | 'হেবা' | 'হেবা-বিল-এওয়াজ' | 'দানপত্র' | 'বণ্টননামা' | 'এওয়াজ' | 'না-দাবী' | 'অন্যান্য';

interface StepBase { id: string; date?: string; note?: string }
export type Step =
  /** Recorded owners in a survey khatian: shares of the plot (they add up to 1). */
  | (StepBase & { kind: 'record'; survey: Survey; khatian: string; owners: { person: string; share: string }[] })
  /** A deed: each seller gives an area (শতক) to the buyers, divided as written. */
  | (StepBase & { kind: 'deed'; no: string; office?: string; type: DeedType; from: { person: string; area: string }[]; to: { person: string; share?: string }[] })
  /** Death: the deceased's whole holding goes to the heirs by their shares (they add up to 1). */
  | (StepBase & { kind: 'inheritance'; deceased: string; heirs: { person: string; share: string }[] })
  /** Mutation (নামজারি): a new khatian for owners who already hold the land; no land moves. */
  | (StepBase & { kind: 'mutation'; caseNo: string; khatian: string; owners: string[] });

export interface TitleChart {
  title: string;
  plot: Plot;
  persons: Person[];
  steps: Step[];
}

/* ---------- replaying the chain ---------- */

export interface Problem { step: string; text: string }
/** Land of each person after each step (শতক, exact). */
export interface Replay {
  /** Holdings after each step, in step order. */
  after: { step: string; holdings: Map<string, Frac> }[];
  /** Who holds what at the end. */
  owners: { person: string; area: Frac }[];
  problems: Problem[];
}

const sum = (xs: Frac[]) => xs.reduce(add, ZERO);

/** Plays the steps in order and checks every one: shares adding to 1, nobody giving more than they hold. */
export function replay(chart: TitleChart): Replay {
  const area = parseFrac(chart.plot.area);
  let h = new Map<string, Frac>();
  const problems: Problem[] = [];
  const after: Replay['after'] = [];
  const name = (id: string) => chart.persons.find((p) => p.id === id)?.name ?? id;
  const holding = (id: string) => h.get(id) ?? ZERO;
  const put = (id: string, v: Frac) => { if (isZero(v)) h.delete(id); else h.set(id, v); };

  for (const s of chart.steps) {
    const next = new Map(h);
    h = next;
    if (s.kind === 'record') {
      const shares = s.owners.map((o) => parseFrac(o.share));
      const total = sum(shares);
      if (cmp(total, ONE) !== 0) problems.push({ step: s.id, text: `খতিয়ানের অংশ যোগ করে ${fracText(total)}, ১ নয়` });
      h.clear();
      s.owners.forEach((o, i) => put(o.person, add(holding(o.person), mul(area, shares[i]))));
    } else if (s.kind === 'deed') {
      let given = ZERO;
      for (const f of s.from) {
        const a = parseFrac(f.area);
        if (cmp(a, holding(f.person)) > 0) problems.push({ step: s.id, text: `${name(f.person)} দিয়েছেন ${toDecimal(a)} শতক, কিন্তু তাঁর ছিল ${toDecimal(holding(f.person))} শতক` });
        put(f.person, sub(holding(f.person), a));
        given = add(given, a);
      }
      const shares = s.to.map((t) => (t.share ? parseFrac(t.share) : frac(1, s.to.length)));
      const total = sum(shares);
      if (cmp(total, ONE) !== 0) problems.push({ step: s.id, text: `ক্রেতাদের অংশ যোগ করে ${fracText(total)}, ১ নয়` });
      s.to.forEach((t, i) => put(t.person, add(holding(t.person), mul(given, shares[i]))));
    } else if (s.kind === 'inheritance') {
      const left = holding(s.deceased);
      if (isZero(left)) problems.push({ step: s.id, text: `${name(s.deceased)}-এর নামে কোনো জমি ছিল না` });
      const shares = s.heirs.map((x) => parseFrac(x.share));
      const total = sum(shares);
      if (cmp(total, ONE) !== 0) problems.push({ step: s.id, text: `ওয়ারিশদের অংশ যোগ করে ${fracText(total)}, ১ নয়` });
      put(s.deceased, ZERO);
      s.heirs.forEach((x, i) => put(x.person, add(holding(x.person), mul(left, shares[i]))));
    } else {
      for (const o of s.owners) if (isZero(holding(o))) problems.push({ step: s.id, text: `নামজারিতে ${name(o)}, কিন্তু তাঁর নামে জমি নেই` });
    }
    // the land never grows or shrinks
    const all = sum([...h.values()]);
    if (cmp(all, area) !== 0 && s.kind !== 'mutation') problems.push({ step: s.id, text: `এই ধাপের পরে মোট ${toDecimal(all)} শতক, দাগের জমি ${toDecimal(area)} শতক` });
    after.push({ step: s.id, holdings: new Map(h) });
  }
  const owners = [...h.entries()].map(([person, a]) => ({ person, area: a }));
  return { after, owners, problems };
}
