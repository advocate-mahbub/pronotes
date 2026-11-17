import { describe, it, expect } from 'vitest';
import { add, frac, parseFrac, toDecimal, replay, layoutChart, chartSvg, SAMPLE_CHART, G, type TitleChart } from '../../src/chart';

describe('title chart: exact shares', () => {
  it('fractions and decimals, Bangla digits too', () => {
    expect(add(frac(1, 3), frac(1, 6))).toEqual(frac(1, 2));
    expect(parseFrac('৭/৪০')).toEqual(frac(7, 40));
    expect(parseFrac('5.775')).toEqual(frac(231, 40));
    expect(toDecimal(frac(1, 3))).toBe('0.3333');
    expect(toDecimal(frac(33, 16))).toBe('2.0625');
  });
  it('replays the sample chain: land neither grows nor shrinks, today’s owners are right', () => {
    const r = replay(SAMPLE_CHART);
    expect(r.problems).toEqual([]);
    const own = Object.fromEntries(r.owners.map((o) => [o.person, toDecimal(o.area)]));
    expect(own).toEqual({ jamila: '2.0625', salma: '2.8875', hasan: '28.05' });
  });
  it('flags what does not add up: heirs not summing to 1, selling more than held', () => {
    const bad: TitleChart = structuredClone(SAMPLE_CHART);
    (bad.steps[1] as { heirs: { share: string }[] }).heirs[0].share = '1/4';
    (bad.steps[3] as { from: { area: string }[] }).from[0].area = '20';
    const r = replay(bad);
    expect(r.problems.map((p) => p.step)).toContain('w1');
    expect(r.problems.some((p) => p.step === 'd1' && p.text.includes('16.5'))).toBe(true);
  });
});

describe('title chart: drawing', () => {
  it('boxes on the 4px grid, never overlapping; receivers below the givers', () => {
    const L = layoutChart(SAMPLE_CHART);
    for (const b of L.boxes) { expect(b.x % G).toBe(0); expect(b.y % G).toBe(0); }
    for (const a of L.boxes) for (const b of L.boxes) {
      if (a === b) continue;
      const apart = a.x + 176 <= b.x || b.x + 176 <= a.x || a.y + 72 <= b.y || b.y + 72 <= a.y;
      expect(apart, a.id + ' / ' + b.id).toBe(true);
    }
    // one box per owner here: the buyer of two deeds is one box, below everyone who sold to him
    const hasan = L.boxes.filter((b) => b.person === 'hasan');
    expect(hasan).toHaveLength(1);
    for (const p of ['rahim', 'abdul', 'alam']) expect(hasan[0].rank).toBeGreaterThan(L.boxes.find((b) => b.person === p)!.rank);
    // a box shows what the person received, and the records naming them
    expect(L.boxes.find((b) => b.person === 'karim')!.tags).toEqual(['CS খতিয়ান 55']);
    expect(L.boxes.find((b) => b.person === 'abdul')!.tags).toEqual(['SA খতিয়ান 88']);
    expect(hasan[0].tags).toEqual(['নামজারি খতিয়ান 410']);
    expect(L.boxes.filter((b) => b.current).map((b) => b.person).sort()).toEqual(['hasan', 'jamila', 'salma']);
  });
  it('one SVG with the plot summary, deeds and Bangla digits', () => {
    const svg = chartSvg(SAMPLE_CHART);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('মৌজা নমুনাপুর');
    expect(svg).toContain('দলিল ১২৩৪');
    expect(svg).toContain('২৮.০৫ শতক');
    expect(svg).not.toContain('⚠');
  });
});
