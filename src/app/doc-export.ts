/**
 * Export documents from the list without opening them (⋯ → শেয়ার/Export, and several at once).
 * Formats that need the page drawn on screen (.png, PDF/print) are made from the open document only.
 */
import type { Doc } from '../storage';
import { kindOf } from '../storage';
import type { DocFormat } from '../docx-export/format';
import { normalizePage, type PageSetup } from '../docx-export/page';
import { docxFileName } from '../docx-export/name';
import { MIME } from '../export/deliver';

export type ListFormat = 'docx' | 'doc' | 'txt' | 'md';
export const LIST_FORMATS: { id: ListFormat; label: string }[] = [
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'doc', label: 'Word 97-2003 (.doc)' },
  { id: 'txt', label: 'লেখা (.txt)' },
  { id: 'md', label: 'Markdown (.md)' },
];

export interface ExportCtx {
  format: DocFormat;
  pageDefault: PageSetup;
}

export async function docFile(d: Doc, fmt: ListFormat, ctx: ExportCtx): Promise<{ blob: Blob; name: string }> {
  const kind = kindOf(d);
  const legal = kind !== 'note';
  const page = legal ? normalizePage(d.page, ctx.pageDefault) : null;
  const title = d.title;
  switch (fmt) {
    case 'docx': {
      const { docxBlob } = await import('../docx-export');
      return { blob: await docxBlob(d.content, title, ctx.format, { kind, page }), name: docxFileName(title, '.docx') };
    }
    case 'doc': {
      const { toRtf } = await import('../export/rtf');
      return { blob: new Blob([toRtf(d.content, title, ctx.format, { kind, page })], { type: MIME.doc }), name: docxFileName(title, '.doc') };
    }
    case 'txt': {
      const { toPlainText } = await import('../export/text');
      return { blob: new Blob(['﻿' + toPlainText(d.content, { lang: page?.lang ?? 'bn', legal })], { type: MIME.txt }), name: docxFileName(title, '.txt') };
    }
    case 'md': {
      const { toMarkdown } = await import('../export/text');
      return { blob: new Blob([toMarkdown(d.content, title, { lang: page?.lang ?? 'bn', legal })], { type: MIME.md }), name: docxFileName(title, '.md') };
    }
  }
}

/** Several documents in one .zip (names made unique). */
export async function docsZip(docs: Doc[], fmt: ListFormat, ctx: ExportCtx): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();
  for (const d of docs) {
    const f = await docFile(d, fmt, ctx);
    let name = f.name;
    for (let i = 2; used.has(name); i++) name = f.name.replace(/(\.\w+)$/, ` (${i})$1`);
    used.add(name);
    zip.file(name, f.blob);
  }
  return zip.generateAsync({ type: 'blob', mimeType: MIME.zip });
}
