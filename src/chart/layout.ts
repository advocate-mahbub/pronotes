/**
 * Where every block and line of a title chart goes, in the owner's format: rows from the first record
 * down; a step's line drops from its sources to a bar, then an arrow down to each receiver.
 * Rules from Diagram Design (MIT): every coordinate on a 4px grid, right-angle lines only, lines that skip
 * rows run through slots between blocks, and a line crossing a bar jumps over it (drawn in svg.ts).
 */
import { bnDigits, check, type Receiver, type TitleChart } from './model';

export const G = 4;
export const GAP_X = 16;
export const ROW_GAP = 72; // room for bars between two rows
export const LINE_H = 16;
export const PAD = 8;

export interface TextLine { text: string; bold?: boolean; small?: boolean }
export interface Node {
  id: string; step: string; person?: string; rank: number;
  lines: TextLine[]; boxed?: boolean; ring?: boolean;
  x: number; y: number; w: number; h: number;
  pass?: boolean; parent?: string;
}
export interface Link { step: string; from: string[]; to: string[]; barY: number; via: Record<string, string[]> }
export interface Layout { nodes: Node[]; passes: Node[]; links: Link[]; width: number; height: number; problems: { step: string; text: string }[] }

const snap = (v: number) => Math.round(v / G) * G;
/** Rough width of a line of Bangla text (no fonts in a test): enough room, never too tight. */
// vowel signs, hasanta and the like share a letter's width, so only the letters count
const letters = (t: string) => [...t.replace(/[\u0981-\u0983\u09bc\u09be-\u09cd\u09d7]/g, '')].length;
const textW = (l: TextLine) => letters(l.text) * (l.small ? 6.2 : 7.8);
const area = (a?: string) => (a ? bnDigits(a) + 'শ' : '');

export function layoutChart(chart: TitleChart): Layout {
  const name = (id: string) => chart.persons.find((p) => p.id === id)?.name ?? id;
  const nodes: Node[] = [];
  const links: Link[] = [];
  const open = new Map<string, string[]>(); // person → their blocks the land now sits in
  const byId = new Map<string, Node>();

  const node = (step: string, lines: TextLine[], sources: string[], extra: Partial<Node> = {}): Node => {
    const rank = sources.length ? Math.max(...sources.map((id) => byId.get(id)!.rank)) + 1 : 0;
    const w = snap(Math.max(84, ...lines.map(textW)) + (extra.boxed ? 24 : 8));
    const n: Node = { id: `${step}:${nodes.length}`, step, rank, lines, x: 0, y: 0, w, h: snap(lines.length * LINE_H + (extra.boxed ? 16 : 4)), ...extra };
    nodes.push(n);
    byId.set(n.id, n);
    return n;
  };
  const receiverLines = (r: Receiver, top?: string): TextLine[] => [
    ...(top ? [{ text: top, small: true }] : []),
    ...(r.relation ? [{ text: bnDigits(r.relation), small: true }] : []),
    { text: name(r.person), bold: true },
    ...(r.area ? [{ text: area(r.area), small: true }] : []),
    ...(r.lines ?? []).map((t) => ({ text: bnDigits(t), small: true })),
  ];
  const land = (person: string, n: Node) => open.set(person, [...(open.get(person) ?? []), n.id]);
  const ring = (step: string, person: string) => chart.highlight?.step === step && chart.highlight.person === person;

  for (const s of chart.steps) {
    if (s.kind === 'record') {
      for (const o of s.owners) {
        const n = node(s.id, receiverLines(o, o.label ?? `${s.survey} রেকর্ডিয় মালিক`), [], { person: o.person, boxed: s.boxed, ring: ring(s.id, o.person) });
        land(o.person, n);
      }
    } else if (s.kind === 'inheritance') {
      const src = open.get(s.deceased) ?? [];
      open.delete(s.deceased);
      const made = s.heirs.map((h) => { const n = node(s.id, receiverLines(h), src, { person: h.person, ring: ring(s.id, h.person) }); land(h.person, n); return n; });
      if (src.length) links.push({ step: s.id, from: src, to: made.map((n) => n.id), barY: 0, via: {} });
    } else if (s.kind === 'deed') {
      const src = s.from.flatMap((p) => open.get(p) ?? []);
      const deed: TextLine[] = [
        { text: `দলিল নং ${bnDigits(s.no)}`, small: true },
        ...(s.date ? [{ text: `তাং ${bnDigits(s.date)}ইং`, small: true }] : []),
        ...(s.type || s.area ? [{ text: [s.type, area(s.area)].filter(Boolean).join('- '), small: true }] : []),
      ];
      const tail = (s.lines ?? []).map((t) => ({ text: bnDigits(t), small: true }));
      if (s.to.length === 1) {
        // one buyer: the deed and the buyer are one block, the buyer's name in bold
        const r = s.to[0];
        const n = node(s.id, [...deed, ...receiverLines({ ...r, area: undefined }), ...tail], src, { person: r.person, ring: ring(s.id, r.person) });
        land(r.person, n);
        if (src.length) links.push({ step: s.id, from: src, to: [n.id], barY: 0, via: {} });
      } else {
        const d = node(s.id, [...deed, { text: `গ্রহীতা- ${bnDigits(String(s.to.length))}জন`, small: true }, ...tail], src);
        if (src.length) links.push({ step: s.id, from: src, to: [d.id], barY: 0, via: {} });
        const made = s.to.map((r) => { const n = node(s.id, receiverLines(r), [d.id], { person: r.person, ring: ring(s.id, r.person) }); land(r.person, n); return n; });
        links.push({ step: s.id + '+', from: [d.id], to: made.map((n) => n.id), barY: 0, via: {} });
      }
    } else if (s.kind === 'merge') {
      const src = open.get(s.person) ?? [];
      const n = node(s.id, [...(s.caption ? [{ text: s.caption, small: true }] : []), { text: name(s.person), bold: true }, ...(s.lines ?? []).map((t) => ({ text: bnDigits(t), small: true }))], src, { person: s.person, ring: ring(s.id, s.person) });
      open.set(s.person, [n.id]);
      if (src.length) links.push({ step: s.id, from: src, to: [n.id], barY: 0, via: {} });
    } else {
      const src = s.through.flatMap((p) => open.get(p) ?? []);
      const n = node(s.id, s.lines.map((t) => ({ text: bnDigits(t), small: true })), src, { boxed: true });
      for (const p of s.through) open.set(p, [n.id]);
      if (src.length) links.push({ step: s.id, from: src, to: [n.id], barY: 0, via: {} });
    }
  }

  // a line that skips rows gets a narrow slot in each row it crosses, so it runs between blocks
  const passes: Node[] = [];
  for (const l of links) {
    const toRank = Math.min(...l.to.map((id) => byId.get(id)!.rank));
    for (const f of l.from) {
      const src = byId.get(f)!;
      const chain: string[] = [];
      let prev = src.id;
      for (let r = src.rank + 1; r < toRank; r++) {
        const v: Node = { id: `${l.step}~${f}~${r}`, step: l.step, rank: r, lines: [], x: 0, y: 0, w: 12, h: 0, pass: true, parent: prev };
        passes.push(v);
        byId.set(v.id, v);
        chain.push(v.id);
        prev = v.id;
      }
      if (chain.length) l.via[f] = chain;
    }
  }
  const all = [...nodes, ...passes];
  const ranks = new Map<number, Node[]>();
  for (const n of all) ranks.set(n.rank, [...(ranks.get(n.rank) ?? []), n]);
  const parentsOf = new Map<string, string[]>();
  for (const l of links) for (const t of l.to) parentsOf.set(t, [...(parentsOf.get(t) ?? []), ...l.from.map((f) => l.via[f]?.at(-1) ?? f)]);
  for (const v of passes) parentsOf.set(v.id, [v.parent!]);
  const maxRank = Math.max(0, ...all.map((n) => n.rank));
  const rowW = (row: Node[]) => row.reduce((a, n) => a + n.w, 0) + Math.max(0, row.length - 1) * GAP_X;
  const width = snap(PAD * 2 + Math.max(0, ...[...ranks.values()].map(rowW)));
  const mid = (n: Node) => n.x + n.w / 2;
  // children under their parents: barycentre order, then each row pushed towards its parents where there is room
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 0; r <= maxRank; r++) {
      const row = ranks.get(r) ?? [];
      const want = (n: Node) => {
        const ps = (parentsOf.get(n.id) ?? []).map((id) => byId.get(id)!).filter(Boolean);
        return ps.length ? ps.reduce((a, p) => a + mid(p), 0) / ps.length : mid(n);
      };
      if (r > 0 || pass > 0) row.sort((a, b) => want(a) - want(b));
      // start centred, then slide each block towards its wish without overlapping its neighbours
      let x = (width - rowW(row)) / 2;
      for (const n of row) { n.x = x; x += n.w + GAP_X; }
      if (r > 0 || pass > 0) {
        for (let i = 0; i < row.length; i++) {
          const n = row[i];
          const lo = i ? row[i - 1].x + row[i - 1].w + GAP_X : PAD;
          n.x = Math.max(lo, want(n) - n.w / 2);
        }
        for (let i = row.length - 1; i >= 0; i--) {
          const n = row[i];
          const hi = i < row.length - 1 ? row[i + 1].x - GAP_X - n.w : width - PAD - n.w;
          n.x = Math.min(n.x, hi);
        }
      }
      for (const n of row) n.x = snap(n.x);
    }
  }
  // rows as tall as their tallest block
  let y = PAD;
  const rowY = new Map<number, number>();
  for (let r = 0; r <= maxRank; r++) {
    rowY.set(r, snap(y));
    const row = ranks.get(r) ?? [];
    y += Math.max(LINE_H, ...row.filter((n) => !n.pass).map((n) => n.h)) + ROW_GAP;
  }
  for (const n of all) { n.y = rowY.get(n.rank)!; if (n.pass) n.h = Math.max(LINE_H, ...(ranks.get(n.rank) ?? []).filter((m) => !m.pass).map((m) => m.h)); }
  // a step's bar sits in the gap above its receivers; steps sharing a gap get their own height
  const gaps = new Map<number, Link[]>();
  for (const l of links) {
    const top = Math.min(...l.to.map((id) => byId.get(id)!.y));
    gaps.set(top, [...(gaps.get(top) ?? []), l]);
  }
  const span = (l: Link) => {
    const xs = [...l.from, ...l.to].map((id) => byId.get(id)!).map(mid);
    return [Math.min(...xs), Math.max(...xs)];
  };
  for (const [top, ls] of gaps) {
    // a bar only needs its own height when it overlaps another one sideways
    const levels: [number, number][][] = [];
    for (const l of ls.sort((a, b) => span(a)[0] - span(b)[0])) {
      const [a, b] = span(l);
      let k = levels.findIndex((lv) => lv.every(([x1, x2]) => b < x1 - 8 || a > x2 + 8));
      if (k < 0) { levels.push([]); k = levels.length - 1; }
      levels[k].push([a, b]);
      l.barY = snap(top - 20 - k * 20);
    }
  }
  const height = snap(y - ROW_GAP + PAD);
  return { nodes, passes, links, width, height, problems: check(chart).problems };
}
