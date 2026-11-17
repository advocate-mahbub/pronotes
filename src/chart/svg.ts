/**
 * The title chart as one SVG (for the screen, print, PDF and Word). Look from Diagram Design (MIT):
 * hairline boxes, right-angle lines, one accent (today's owners), a summary block on top.
 */
import { layoutChart, BOX_H, BOX_W, PAD } from './layout';
import { toDecimal, type TitleChart, SURVEYS } from './model';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const bn = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

export interface ChartStyle { font: string; ink: string; muted: string; line: string; paper: string; accent: string; accentInk: string }
export const CHART_STYLE: ChartStyle = {
  font: '"Noto Sans Bengali", "Kalpurush", sans-serif',
  ink: '#0b1b33', muted: '#5f6878', line: '#b9c0cc', paper: '#ffffff', accent: '#c8a45d', accentInk: '#3d2e0c',
};

const HEAD_H = 88;

export function chartSvg(chart: TitleChart, st: ChartStyle = CHART_STYLE): string {
  const L = layoutChart(chart);
  const width = Math.max(L.width, 560);
  const dx = (width - L.width) / 2;
  const top = HEAD_H + 16;
  const name = (id: string) => chart.persons.find((p) => p.id === id)?.name ?? id;
  const rel = (id: string) => chart.persons.find((p) => p.id === id)?.relation ?? '';
  const byId = new Map([...L.boxes, ...L.passes].map((b) => [b.id, b]));
  const out: string[] = [];
  const W = width;
  const H = top + L.height + (L.problems.length ? 24 + L.problems.length * 18 : 0) + 8;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${st.font}' role="img" aria-label="${esc(chart.title)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${st.paper}"/>`);

  // summary block (Diagram Design "high-level"): what land this is
  const p = chart.plot;
  const dags = SURVEYS.filter((s) => p.dag[s]).map((s) => `${s} ${p.dag[s]}`).join(' · ');
  out.push(`<rect x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${HEAD_H - PAD}" rx="6" fill="none" stroke="${st.line}"/>`);
  out.push(`<text x="${PAD + 12}" y="${PAD + 24}" font-size="16" font-weight="700" fill="${st.ink}">${esc(chart.title)}</text>`);
  out.push(`<text x="${PAD + 12}" y="${PAD + 46}" font-size="12" fill="${st.muted}">${esc(bn([p.district, p.upazila, 'মৌজা ' + p.mouza, p.jl ? 'জে.এল. ' + p.jl : ''].filter(Boolean).join(' · ')))}</text>`);
  out.push(`<text x="${W - PAD - 12}" y="${PAD + 24}" font-size="12" text-anchor="end" fill="${st.ink}">${esc(bn('দাগ ' + dags))}</text>`);
  out.push(`<text x="${W - PAD - 12}" y="${PAD + 46}" font-size="12" text-anchor="end" fill="${st.muted}">${esc(bn('জমি ' + p.area + ' শতক'))}</text>`);

  // lines first, boxes on top
  for (const l of L.links) {
    const from = l.from.map((id) => byId.get(id)!).filter(Boolean);
    const to = l.to.map((id) => byId.get(id)!).filter(Boolean);
    const y = top + l.barY;
    const xs = to.map((b) => dx + b.x + BOX_W / 2);
    const dash = l.dashed ? ' stroke-dasharray="4 4"' : '';
    const path: string[] = [];
    for (const b of from) {
      // down from the giver, through the pass-through slots of the rows in between, to the bar
      let cx = dx + b.x + BOX_W / 2;
      let cy = top + b.y + BOX_H;
      let d = `M${cx} ${cy}`;
      for (const id of l.via[b.id] ?? []) {
        const v = byId.get(id)!;
        const vx = dx + v.x + 8;
        // step aside right under the giver (clear of the bars lower down), then straight down the slot
        const jog = cx === vx ? '' : `V${cy + 16}H${vx}`;
        d += `${jog}V${top + v.y + BOX_H + 8}`;
        cx = vx;
        cy = top + v.y + BOX_H + 8;
      }
      path.push(d + `V${y}`);
      xs.push(cx);
    }
    if (xs.length > 1) path.push(`M${Math.min(...xs)} ${y}H${Math.max(...xs)}`);
    for (const b of to) path.push(`M${dx + b.x + BOX_W / 2} ${y}V${top + b.y - 4}`);
    out.push(`<path d="${path.join('')}" fill="none" stroke="${st.muted}" stroke-width="1"${dash}/>`);
    for (const b of to) out.push(`<path d="M${dx + b.x + BOX_W / 2 - 4} ${top + b.y - 8}l4 6 4-6" fill="none" stroke="${st.muted}"/>`);
    // the step's label, on a paper patch across the bar
    const lx = Math.min(...xs) + 8;
    const ly = y - 8 - (l.label.length - 1) * 13;
    l.label.forEach((t, i) => out.push(`<text x="${lx}" y="${ly + i * 13}" font-size="11" fill="${st.ink}" paint-order="stroke" stroke="${st.paper}" stroke-width="4">${esc(bn(t))}</text>`));
  }
  for (const b of L.boxes) {
    const x = dx + b.x, y = top + b.y;
    const fill = b.current ? st.accent : st.paper;
    const ink = b.current ? st.accentInk : st.ink;
    out.push(`<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${fill}" stroke="${b.current ? st.accent : st.line}"/>`);
    out.push(`<text x="${x + 12}" y="${y + 22}" font-size="13" font-weight="600" fill="${ink}">${esc(name(b.person))}</text>`);
    const sub = [rel(b.person), toDecimal(b.area) + ' শতক'].filter(Boolean).join(' · ');
    out.push(`<text x="${x + 12}" y="${y + 42}" font-size="11" fill="${b.current ? ink : st.muted}">${esc(bn(sub))}</text>`);
    if (b.tags.length) out.push(`<text x="${x + 12}" y="${y + 60}" font-size="10" fill="${b.current ? ink : st.muted}">${esc(bn(b.tags.join(' · ')))}</text>`);
  }
  // what does not add up, under the chart
  L.problems.forEach((pr, i) => out.push(`<text x="${PAD}" y="${top + L.height + 16 + i * 18}" font-size="12" fill="#b3261e">⚠ ${esc(bn(pr.text))}</text>`));
  out.push('</svg>');
  return out.join('\n');
}
