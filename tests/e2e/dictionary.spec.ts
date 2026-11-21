import { test, expect, type Page } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';

// decisions.md 92: the dictionary — in ▦, one search box, a clean card, ZIP import, duplicates as one word,
// a Bangla meaning into the draft, the Oxford 3000/5000 list apart
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], cen: Buffer[] = [];
  let off = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path), raw = Buffer.from(text), data = deflateRawSync(raw);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(raw.length, 22); loc.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(loc, name, data); cen.push(c, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cen.length / 2, 8); end.writeUInt16LE(cen.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const j = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n');
const DATA = zip({
  'X/extraction/pronotes_import_v4.jsonl': j([
    { id: 'e1', title: 'easement', content: 'A right over land.', language: 'en', metadata: { part_of_speech_candidate: 'n.' } },
    { id: 'e2', title: 'easement', content: 'Second copy.', language: 'en' },
    { id: 'e3', title: 'estoppel', content: 'A rule of evidence.', language: 'en' },
  ]),
  'X/extraction/dictionary_senses_v3.jsonl': j([
    { entry_id: 'e1', sense_id: 's1', sense_number: 1, sense_text: 'A right enjoyed by an owner of\nland over the land of another.' },
    { entry_id: 'e2', sense_id: 's2', sense_number: 1, sense_text: 'Also used of a way-\nleave.' },
    { entry_id: 'e3', sense_id: 's3', sense_number: 1, sense_text: 'A rule of evidence.' },
  ]),
  'X/extraction/cross_references_resolved_v4.jsonl': j([{ entry_id: 'e1', relation: 'see also', targets: [{ text: 'ESTOPPEL', matched_entry_ids: ['e3'], match_status: 'exact_unique' }] }]),
});
const WORDS = JSON.stringify({ format: 'pronotes-oxford-wordlist', version: 1, words: [
  { w: 'abandon', pos: 'v.', lvl: 'B2', list: '3000' }, { w: 'about', pos: 'prep., adv.', lvl: 'A1', list: '3000' }, { w: 'absorb', pos: 'v.', lvl: 'B2', list: '5000' }, { w: 'abstract', pos: 'adj.', lvl: 'C1', list: '5000' },
] });

const openDict = async (page: Page) => {
  await page.getByTestId('craft-toggle').click();
  await page.getByTestId('craft-dictionary').click();
  await expect(page.getByTestId('law-dictionary')).toBeVisible();
};

test('ZIP import, one search box, duplicates as one word with numbered, re-joined meanings; a Bangla meaning goes into the draft', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  await page.keyboard.insertText('দাবি: ');
  await openDict(page);
  await expect(page.getByTestId('dict-empty')).toBeVisible();
  await page.getByTestId('dict-import-file').setInputFiles({ name: 'ProNotes_Oxford_Law_Dictionary_Extraction_v4.zip', mimeType: 'application/zip', buffer: DATA });
  await expect(page.getByTestId('dict-msg')).toContainText('3');
  await page.getByTestId('dict-search').fill('ease');
  await expect(page.getByTestId('dict-results').locator('li')).toHaveCount(1);
  await page.getByTestId('dict-results').locator('button').first().click();
  await expect(page.getByTestId('dict-word')).toContainText('easement');
  const senses = page.getByTestId('dict-senses').locator('li');
  await expect(senses).toHaveCount(2);
  await expect(senses.first()).toHaveText('A right enjoyed by an owner of land over the land of another.');
  await expect(senses.nth(1)).toHaveText('Also used of a way-leave.');
  await expect(page.locator('.ld-related')).toContainText('estoppel');
  // a Bangla meaning (edit), then into the draft as "Bangla (English)"
  await page.getByTestId('dict-edit').click();
  await page.getByTestId('dict-add-meaning').fill('সুখাধিকার');
  await page.getByTestId('dict-add-meaning-save').click();
  await expect(page.getByTestId('dict-meanings')).toContainText('সুখাধিকার');
  await page.getByTestId('dict-insert').click();
  await expect(page.getByTestId('law-dictionary')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toContainText('দাবি: সুখাধিকার (easement)');
});

test('Bangla letters search the Bangla words; a new Bangla term from ⋯', async ({ page }) => {
  await page.goto('./');
  await openDict(page);
  await page.getByTestId('dict-menu').click();
  await page.getByTestId('dict-new-term').click();
  await page.getByTestId('dict-new-word').fill('নামজারি');
  await page.getByTestId('dict-new-def').fill('খতিয়ানে মালিকের নাম বদল');
  await page.getByTestId('dict-new-save').click();
  await expect(page.getByTestId('dict-word')).toContainText('নামজারি');
  await page.getByTestId('dict-back').click();
  await page.getByTestId('dict-search').fill('নাম');
  await expect(page.getByTestId('dict-results')).toContainText('নামজারি');
});

test('Oxford 3000/5000: its own tab and its own data, filtered by level', async ({ page }) => {
  await page.goto('./');
  await openDict(page);
  await page.getByTestId('dict-tab-words').click();
  await expect(page.getByTestId('words-empty')).toBeVisible();
  await page.getByTestId('dict-import-words-file').setInputFiles({ name: 'oxford-3000-5000.json', mimeType: 'application/json', buffer: Buffer.from(WORDS) });
  await expect(page.getByTestId('words-list').locator('li')).toHaveCount(4);
  await page.getByTestId('words-lvl-B2').click();
  await expect(page.getByTestId('words-list').locator('li')).toHaveCount(2);
  await page.getByTestId('words-search').fill('abs');
  await expect(page.getByTestId('words-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('words-list')).toContainText('Oxford 5000');
  // the law side is untouched
  await page.getByTestId('dict-tab-law').click();
  await expect(page.getByTestId('dict-empty')).toBeVisible();
});
