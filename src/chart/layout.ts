/**
 * Where every box and line of a title chart goes. Rules from Diagram Design (MIT): every coordinate on a
 * 4px grid, right-angle lines only, boxes of one size, at most one highlighted thing (today's owners).
 * Rows are steps of the chain: a box is an owner from the moment land reaches them.
 */
import { add, parseFrac, replay, toDecimal, ZERO, type Frac, type TitleChart } from './model';

export const G = 4; // grid
export const BOX_W = 176;
export const BOX_H = 72;
export const GAP_X = 24;
export const ROW_GAP = 120; // room for the deed line between two rows
export const PAD = 24;

/** One owner from the moment land reaches them: area received (শতক), and the records that name them. */
export interface Box { id: string; person: string; step: string; rank: number; x: number; y: number; area: Frac; current: boolean; tags: string[]; pass?: boolean; parent?: string }
/** One step drawn as lines: from the sources down to a bar, then down to each receiver. */
export interface Link { step: string; from: string[]; to: string[]; barY: number; label: string[]; dashed: boolean; /** pass-through slots for a line that skips rows, by source */ via: Record<string, string[]> }
export interface Layout { boxes: Box[]; links: Link[]; width: number; height: number; problems: { step: string; text: string }[]; passes: Box[] }

const snap = (v: number) => Math.round(v / G) * G;

export function layoutChart(chart: TitleChart): Layout {
  let passBoxes: Box[] = [];
  const rp = replay(chart);
  const boxes: Box[] = [];
  const links: Link[] = [];
  const latest = new Map<string, Box>(); // person → their newest box
  const name = (id: string) => chart.persons.find((p) => p.id === id)?.name ?? id;

  const outgoing = new Set<string>(); // boxes something already comes out of
  chart.steps.forEach((s, i) => {
    const held = rp.after[i].holdings;
    const areaOf = (person: string) => held.get(person) ?? { n: 0n, d: 1n };
    /** A receiver's box: their open box if nothing has left it yet (moved below the givers), else a new one. */
    const receive = (person: string, sources: Box[]): Box => {
      const rank = sources.length ? Math.max(...sources.map((b) => b.rank)) + 1 : 0;
      const open = latest.get(person);
      if (open && !outgoing.has(open.id) && !sources.includes(open)) {
        open.rank = Math.max(open.rank, rank);
        open.area = areaOf(person);
        return open;
      }
      const b: Box = { id: s.id + ':' + person, person, step: s.id, rank, x: 0, y: 0, area: areaOf(person), current: false, tags: [] };
      boxes.push(b);
      latest.set(person, b);
      return b;
    };
    const give = (from: Box[]) => from.forEach((b) => outgoing.add(b.id));
    if (s.kind === 'record') {
      // a survey record names who holds the land: a tag on their boxes; only someone new gets a box
      for (const o of s.owners) {
        const b = latest.get(o.person) ?? receive(o.person, []);
        b.tags.push(`${s.survey} খতিয়ান ${s.khatian}`);
      }
    } else if (s.kind === 'deed') {
      const src = s.from.map((f) => latest.get(f.person)).filter((b): b is Box => !!b);
      const made = s.to.map((t) => receive(t.person, src));
      give(src);
      const given = s.from.map((f) => parseFrac(f.area)).reduce(add, ZERO);
      links.push({ step: s.id, from: src.map((b) => b.id), to: made.map((b) => b.id), barY: 0, dashed: false, via: {},
        label: [`দলিল ${s.no}${s.date ? ' · ' + s.date : ''}`, `${s.type} · ${toDecimal(given)} শতক`] });
    } else if (s.kind === 'inheritance') {
      const src = latest.get(s.deceased);
      const made = s.heirs.map((x) => receive(x.person, src ? [src] : []));
      if (src) give([src]);
      links.push({ step: s.id, from: src ? [src.id] : [], to: made.map((b) => b.id), barY: 0, dashed: false, via: {},
        label: [`${name(s.deceased)}-এর ওয়ারিশ${s.date ? ' · ' + s.date : ''}`] });
    } else {
      for (const o of s.owners) latest.get(o)?.tags.push(`নামজারি খতিয়ান ${s.khatian}`);
    }
  });

  // today's owners
  const finalIds = new Set(rp.owners.map((o) => o.person));
  for (const b of latest.values()) if (finalIds.has(b.person)) b.current = true;

  // a line that skips rows gets a narrow pass-through slot in each row it crosses, so it runs between boxes
  const PASS_W = 16;
  const passes: Box[] = [];
  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const l of links) {
    const toRank = Math.min(...l.to.map((id) => byId.get(id)!.rank));
    for (const f of l.from) {
      const src = byId.get(f)!;
      const chain: string[] = [];
      let prev = src.id;
      for (let r = src.rank + 1; r < toRank; r++) {
        const v: Box = { id: `${l.step}~${f}~${r}`, person: '', step: l.step, rank: r, x: 0, y: 0, area: ZERO, current: false, tags: [], pass: true, parent: prev };
        passes.push(v);
        byId.set(v.id, v);
        chain.push(v.id);
        prev = v.id;
      }
      if (chain.length) l.via[f] = chain;
    }
  }
  const all = [...boxes, ...passes];
  const w = (b: Box) => (b.pass ? PASS_W : BOX_W);

  // rows, ordered so that children sit under their parents (two passes of the barycentre rule)
  const ranks = new Map<number, Box[]>();
  for (const b of all) ranks.set(b.rank, [...(ranks.get(b.rank) ?? []), b]);
  const parentsOf = new Map<string, string[]>();
  for (const l of links) for (const t of l.to) parentsOf.set(t, [...(parentsOf.get(t) ?? []), ...l.from.map((f) => l.via[f]?.at(-1) ?? f)]);
  for (const v of passes) parentsOf.set(v.id, [v.parent!]);
  const maxRank = Math.max(0, ...all.map((b) => b.rank));
  const rowW = (row: Box[]) => row.reduce((a, b) => a + w(b), 0) + Math.max(0, row.length - 1) * GAP_X;
  const width = snap(PAD * 2 + Math.max(BOX_W, ...[...ranks.values()].map(rowW)));
  const place = (row: Box[]) => {
    let x = (width - rowW(row)) / 2;
    for (const b of row) { b.x = snap(x); x += w(b) + GAP_X; }
  };
  const mid = (b: Box) => b.x + w(b) / 2;
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r <= maxRank; r++) {
      const row = ranks.get(r) ?? [];
      if (r > 0 || pass > 0) {
        const centre = (b: Box) => {
          const ps = (parentsOf.get(b.id) ?? []).map((id) => byId.get(id)!).filter(Boolean);
          return ps.length ? ps.reduce((a, p) => a + mid(p), 0) / ps.length : mid(b);
        };
        row.sort((a, b) => centre(a) - centre(b));
      }
      place(row);
    }
  }
  for (const b of all) b.y = snap(PAD + b.rank * (BOX_H + ROW_GAP));
  // each step's bar sits in the gap above its receivers; steps sharing a gap get their own height
  const perGap = new Map<number, number>();
  for (const l of [...links].reverse()) {
    const top = Math.min(...l.to.map((id) => byId.get(id)!.y));
    const k = perGap.get(top) ?? 0;
    perGap.set(top, k + 1);
    l.barY = snap(top - 20 - k * 40);
  }
  const height = snap(PAD * 2 + (maxRank + 1) * BOX_H + maxRank * ROW_GAP);
  passBoxes = passes;
  return { boxes, links, width, height, problems: rp.problems, passes: passBoxes };
}

