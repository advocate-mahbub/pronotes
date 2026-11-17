import { describe, it, expect } from 'vitest';
import { add, frac, parseFrac, readFrac, toDecimal, check, layoutChart, chartSvg, chartPageSvg, SAMPLE_CHART, G, type TitleChart, type Step } from '../../src/chart';

describe('title chart: exact shares', () => {
  it('fractions and decimals, Bangla digits and the শ ending', () => {
    expect(add(frac(1, 3), frac(1, 6))).toEqual(frac(1, 2));
    expect(parseFrac('৭/৪০')).toEqual(frac(7, 40));
    expect(readFrac('৪৬.৮১শ')).toEqual(frac(4681, 100));
    expect(readFrac('৪পুত্র')).toBeNull();
    expect(toDecimal(frac(1, 3))).toBe('0.3333');
  });
  it('the sample adds up', () => {
    expect(check(SAMPLE_CHART).problems).toEqual([]);
  });
  it('flags heirs not adding to 1, and a deed for more than the giver had', () => {
    const bad: TitleChart = structuredClone(SAMPLE_CHART);
    const w1 = bad.steps.find((s) => s.id === 'w1') as Extract<Step, { kind: 'inheritance' }>;
    w1.heirs[0].share = '1/2';
    const d1 = bad.steps.find((s) => s.id === 'd1') as Extract<Step, { kind: 'deed' }>;
    d1.area = '90';
    const p = check(bad).problems;
    expect(p.some((x) => x.step === 'w1')).toBe(true);
    expect(p.some((x) => x.step === 'd1')).toBe(true);
  });
});

describe('title chart: drawing in the owner’s format', () => {
  const L = layoutChart(SAMPLE_CHART);
  it('blocks on the 4px grid, never overlapping; receivers below their sources', () => {
    for (const n of L.nodes) { expect(n.x % G).toBe(0); expect(n.y % G).toBe(0); }
    for (const a of L.nodes) for (const b of L.nodes) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, a.id + ' / ' + b.id).toBe(true);
    }
    const byId = new Map(L.nodes.map((n) => [n.id, n]));
    for (const l of L.links) for (const f of l.from) for (const t of l.to) expect(byId.get(t)!.rank).toBeGreaterThan(byId.get(f)!.rank);
  });
  it('a deed with one buyer is one block: number, date, kind-area, then the buyer in bold', () => {
    const d = L.nodes.find((n) => n.step === 'd5')!;
    expect(d.lines.map((l) => l.text)).toEqual(['দলিল নং ৫০০৫', 'তাং ০৭/০৯/২০০৮ইং', 'সাফ কবলা- ৪.১২৫শ', 'পারভীন আক্তার', 'সিটি দাগ নং ৬০১']);
    expect(d.lines[3].bold).toBe(true);
  });
  it('inheritance and purchase come together in one block, from every source', () => {
    const m = L.nodes.find((n) => n.step === 'mk')!;
    expect(m.lines[0].text).toBe('ওয়ারিশ ও খরিদসূত্রে মালিক'.replace(/য়/g, 'য়'));
    const into = L.links.find((l) => l.to.includes(m.id))!;
    expect(into.from).toHaveLength(4);
  });
  it('the page: heading, chain, notes; one ring around the highlighted person', () => {
    const svg = chartPageSvg(SAMPLE_CHART);
    expect(svg).toContain('viewBox="0 0 612 1008"');
    expect(svg).toContain('অন্য মোকদ্দমা নং ০০/২০২৬');
    expect((svg.match(/<ellipse/g) ?? []).length).toBe(1);
    expect(chartSvg(SAMPLE_CHART)).not.toContain('⚠');
  });
});
