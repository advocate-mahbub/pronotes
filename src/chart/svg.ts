/**
 * The title chart as one SVG page in the owner's format (Legal paper by default): heading, the chain,
 * the argument under it and the "Prepared By" block. Lines with filled arrowheads; a bar jumps over a
 * line it crosses (Diagram Design); one ring around the person the case is about.
 */
import { layoutChart, LINE_H, type Node } from './layout';
import { bnDigits, type TitleChart } from './model';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface ChartStyle { font: string; ink: string; muted: string; paper: string }
export const CHART_STYLE: ChartStyle = { font: '"SutonnyOMJ", "Noto Sans Bengali", "Kalpurush", sans-serif', ink: '#111111', muted: '#333333', paper: '#ffffff' };

/** Paper in points (Legal 8.5 × 14 in, as the owner's charts). */
export const PAPER = { legal: { w: 612, h: 1008 }, a4: { w: 595, h: 842 }, folio: { w: 595, h: 935 } } as const;

/** Wraps a paragraph to about `max` characters a line. */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && [...(line + ' ' + w)].length > max) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

/** The chain alone (no page): for the screen. */
export function chainSvg(chart: TitleChart, st: ChartStyle = CHART_STYLE): { svg: string; width: number; height: number } {
  const L = layoutChart(chart);
  const byId = new Map<string, Node>([...L.nodes, ...L.passes].map((n) => [n.id, n]));
  const out: string[] = [];
  const cx = (n: Node) => n.x + n.w / 2;
  const vertical: { x: number; y1: number; y2: number }[] = [];
  const bars: { y: number; x1: number; x2: number }[] = [];
  const paths: string[] = [];
  const heads: string[] = [];

  for (const l of L.links) {
    const from = l.from.map((id) => byId.get(id)!);
    const to = l.to.map((id) => byId.get(id)!);
    const y = l.barY;
    const xs = to.map(cx);
    for (const f of from) {
      let x = cx(f);
      let yy = f.y + f.h;
      let d = `M${x} ${yy}`;
      for (const id of l.via[f.id] ?? []) {
        const v = byId.get(id)!;
        const vx = cx(v);
        if (vx !== x) { d += `V${yy + 8}H${vx}`; bars.push({ y: yy + 8, x1: Math.min(x, vx), x2: Math.max(x, vx) }); vertical.push({ x, y1: yy, y2: yy + 8 }); yy += 8; x = vx; }
        vertical.push({ x, y1: yy, y2: v.y + v.h + 8 });
        yy = v.y + v.h + 8;
        d += `V${yy}`;
      }
      vertical.push({ x, y1: yy, y2: y });
      paths.push(d + `V${y}`);
      xs.push(x);
    }
    const x1 = Math.min(...xs), x2 = Math.max(...xs);
    if (x2 > x1) bars.push({ y, x1, x2 });
    for (const t of to) {
      vertical.push({ x: cx(t), y1: y, y2: t.y - 2 });
      paths.push(`M${cx(t)} ${y}V${t.y - 9}`);
      heads.push(`<path d="M${cx(t) - 5} ${t.y - 10}L${cx(t) + 5} ${t.y - 10}L${cx(t)} ${t.y - 2}Z" fill="${st.ink}"/>`);
    }
  }
  // bars, jumping over the lines they cross
  for (const b of bars) {
    const cuts = vertical.filter((v) => v.x > b.x1 + 6 && v.x < b.x2 - 6 && v.y1 < b.y - 1 && v.y2 > b.y + 1).map((v) => v.x).sort((a, c) => a - c);
    let d = `M${b.x1} ${b.y}`;
    for (const x of cuts) d += `H${x - 5}A5 5 0 0 1 ${x + 5} ${b.y}`;
    paths.push(d + `H${b.x2}`);
  }
  out.push(`<g fill="none" stroke="${st.ink}" stroke-width="1.4">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(...heads);

  for (const n of L.nodes) {
    if (n.boxed) out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${st.paper}" stroke="${st.ink}" stroke-width="1"/>`);
    const top = n.y + (n.boxed ? 8 : 2);
    n.lines.forEach((l, i) => out.push(`<text x="${cx(n)}" y="${top + (i + 1) * LINE_H - 4}" text-anchor="middle" font-size="${l.bold ? 14 : 11.5}"${l.bold ? ' font-weight="700"' : ''} fill="${l.small ? st.muted : st.ink}">${esc(l.text)}</text>`));
    if (n.ring) {
      const bi = n.lines.findIndex((l) => l.bold);
      const ry = (n.h - (bi > 0 ? LINE_H * bi : 0)) / 2 + 6;
      out.push(`<ellipse cx="${cx(n)}" cy="${n.y + (bi > 0 ? LINE_H * bi : 0) + ry - 4}" rx="${n.w / 2 + 6}" ry="${ry}" fill="none" stroke="${st.ink}" stroke-width="1.2"/>`);
    }
  }
  L.problems.forEach((p, i) => out.push(`<text x="4" y="${L.height + 16 + i * 16}" font-size="12" fill="#b3261e">⚠ ${esc(p.text)}</text>`));
  const height = L.height + (L.problems.length ? 8 + L.problems.length * 16 : 0);
  return { svg: out.join('\n'), width: L.width, height };
}

/** The whole page: heading, the chain scaled to fit, the argument and the Prepared By block. */
export function chartPageSvg(chart: TitleChart, paper: keyof typeof PAPER = 'legal', st: ChartStyle = CHART_STYLE): string {
  const P = PAPER[paper];
  const M = 30;
  const out: string[] = [];
  let y = M;
  const head = chart.heading ?? [];
  head.forEach((t, i) => { y += i === 0 ? 20 : 14; out.push(`<text x="${P.w / 2}" y="${y}" text-anchor="middle" font-size="${i === 0 ? 18 : 12}" font-weight="700" fill="${st.ink}">${esc(bnDigits(t))}</text>`); });
  if (head.length) y += 16;
  // what goes under the chain
  const foot: string[] = [];
  let fy = 0;
  for (const para of chart.notes ?? []) {
    for (const line of wrap(bnDigits(para), 64)) { fy += 15; foot.push(`<text x="${P.w / 2}" y="FY${fy}" text-anchor="middle" font-size="11" fill="${st.ink}">${esc(line)}</text>`); }
    fy += 8;
  }
  if (chart.preparedBy?.length) {
    fy += 12;
    chart.preparedBy.forEach((t, i) => { fy += i === 1 ? 22 : 13; foot.push(`<text x="${M + 60}" y="FY${fy}" font-size="${i === 1 ? 11 : 10}"${i === 1 ? ' font-weight="700"' : ''} fill="${st.ink}">${esc(t)}</text>`); });
  }
  const chain = chainSvg(chart, st);
  const roomH = P.h - y - M - fy - 12;
  // fill the page: grow a small chain (up to 1.4×), shrink a big one to fit
  const scale = Math.min(1.4, (P.w - M * 2) / chain.width, roomH / chain.height);
  const cw = chain.width * scale, ch = chain.height * scale;
  out.push(`<g transform="translate(${(P.w - cw) / 2} ${y}) scale(${scale.toFixed(4)})">${chain.svg}</g>`);
  const footTop = y + ch + 12;
  out.push(...foot.map((s) => s.replace(/y="FY([\d.]+)"/, (_m, v) => `y="${footTop + Number(v)}"`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.w} ${P.h}" width="${P.w}pt" height="${P.h}pt" font-family='${st.font}'>`
    + `<rect width="${P.w}" height="${P.h}" fill="${st.paper}"/>` + out.join('\n') + '</svg>';
}

/** The chain alone as a standalone SVG. */
export function chartSvg(chart: TitleChart, st: ChartStyle = CHART_STYLE): string {
  const c = chainSvg(chart, st);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 ${c.width + 16} ${c.height + 16}" width="${c.width + 16}" height="${c.height + 16}" font-family='${st.font}'><rect x="-8" y="-8" width="${c.width + 16}" height="${c.height + 16}" fill="${st.paper}"/>${c.svg}</svg>`;
}
