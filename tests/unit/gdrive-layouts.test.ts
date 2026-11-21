import { describe, it, expect } from 'vitest';
import { listDriveLayouts, uploadDriveLayout, downloadDriveLayout, planLayoutSync, LAYOUTS_FOLDER, type DriveLayout } from '../../src/storage/gdrive';

const r = (id: string, pn?: string): DriveLayout => ({ id, name: id + '.pnlayout.json', appProperties: pn ? { pnLayout: pn } : undefined });

describe('own layouts in Drive (decisions.md 94)', () => {
  it('plans like fonts: new here go up, new there come down, deleted here go to the bin', () => {
    const p = planLayoutSync([{ id: 'custom-1' }, { id: 'custom-2' }], [r('D1', 'custom-2'), r('D2', 'custom-3'), r('D3', 'custom-4'), r('D4')], ['custom-4']);
    expect(p.up).toEqual(['custom-1']);
    expect(p.down.map((x) => x.id)).toEqual(['D2']);
    expect(p.trash.map((x) => x.id)).toEqual(['D3']);
  });
  it('a layout uploaded twice: one copy stays', () => {
    const p = planLayoutSync([], [r('D1', 'custom-1'), r('D2', 'custom-1')], []);
    expect(p.down.map((x) => x.id)).toEqual(['D1']);
    expect(p.trash.map((x) => x.id)).toEqual(['D2']);
  });
  it('uploads the layout as JSON into its own folder and reads it back', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('mimeType')) return json({ files: [{ id: 'FOLDER' }] });
      if (url.includes('alt=media')) return json({ id: 'custom-1', name: 'UniBijoy', map: {} });
      if (url.includes('in+parents') || url.includes('in%20parents') || url.includes('parents')) return json({ files: [r('D1', 'custom-1')] });
      return json({ id: 'NEW' });
    }) as unknown as typeof fetch;
    expect(await uploadDriveLayout('tk', { id: 'custom-1', name: 'Uni/Bijoy' }, f)).toEqual({ id: 'NEW' });
    const body = await new Response(calls.at(-1)!.init.body as Blob).text();
    expect(body).toContain('"name":"Uni Bijoy.pnlayout.json"');
    expect(body).toContain('"pnLayout":"custom-1"');
    expect(body).toContain('"parents":["FOLDER"]');
    expect(decodeURIComponent(calls[0].url).replace(/\+/g, ' ')).toContain(LAYOUTS_FOLDER);
    expect((await listDriveLayouts('tk', f)).map((x) => x.id)).toEqual(['D1']);
    expect(await downloadDriveLayout('tk', 'D1', f)).toMatchObject({ id: 'custom-1', name: 'UniBijoy' });
  });
});
