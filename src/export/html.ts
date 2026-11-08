/**
 * A standalone web page (.html) of the document: opens in any browser, prints on the document's
 * paper with its margins, and keeps the court paragraph styles and numbering.
 */
import { DEFAULT_FORMAT, NOTE_FONT, NOTE_SIZE, type DocFormat } from '../docx-export/format';
import { DEFAULT_PAGE, NOTE_PAGE, normalizePage, pageSize, type PageSetup } from '../docx-export/page';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtmlDocument(bodyHtml: string, title: string, f: DocFormat = DEFAULT_FORMAT, o: { kind?: string; page?: Partial<PageSetup> | null } = {}): string {
  const legal = (o.kind ?? 'legal') !== 'note';
  const page = normalizePage(o.page, legal ? DEFAULT_PAGE : NOTE_PAGE);
  const { w, h } = pageSize(page);
  const inch = (tw: number) => (tw / 1440).toFixed(3) + 'in';
  const font = !legal ? NOTE_FONT : page.lang === 'en' ? f.fontEn : f.font;
  const size = legal ? f.size : NOTE_SIZE;
  const line = legal ? f.lineSpacing * 1.3 : 1.7;
  const counter = page.lang === 'bn' ? 'counter(pn, bengali) "।"' : 'counter(pn) "."';
  const m = page.margins;
  const css = `
@page { size: ${inch(w)} ${inch(h)}; margin: ${inch(m.top)} ${inch(m.right)} ${inch(m.bottom)} ${inch(m.left)}; }
html { background: #eee; }
body { margin: 24px auto; max-width: ${inch(w)}; background: #fff; padding: ${inch(m.top)} ${inch(m.right)} ${inch(m.bottom)} ${inch(m.left)}; box-sizing: border-box;
  font-family: "${font}", "Noto Sans Bengali", "Nirmala UI", "Vrinda", serif; font-size: ${size}pt; line-height: ${line}; color: #000; counter-reset: pn; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
@media print { html { background: none; } body { margin: 0; padding: 0; max-width: none; box-shadow: none; } div[data-page-break] { break-after: page; } }
p { margin: 0 0 6pt; ${legal ? 'text-align: justify;' : ''} }
${legal ? `p[data-pstyle="normal"] { text-indent: 0.5in; }
p[data-pstyle="numbered"] { padding-left: 0.5in; text-indent: -0.5in; }
p[data-pstyle="numbered"]::before { counter-increment: pn; content: ${counter}; display: inline-block; width: 0.5in; text-indent: 0; }
p[data-pstyle="heading"] { text-align: center; font-weight: 700; }
p[data-pstyle="title"] { text-align: center; font-weight: 700; font-size: ${f.titleSize}pt; }
p[data-pstyle="party"] { margin-left: 2.278in; } p[data-pstyle="party2"] { margin-left: 2.556in; } p[data-pstyle="right"] { text-align: right; }` : ''}
h1, h2, h3 { line-height: 1.35; margin: 12pt 0 6pt; } h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.12em; }
table { --tb-w: 1px; --tb-c: #000; --tb-pad: 6pt; border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: var(--tb-w) solid var(--tb-c); padding: 2pt var(--tb-pad); vertical-align: top; }
td p, th p { margin: 0; text-indent: 0 !important; text-align: left; }
th p:not([style*="text-align"]) { text-align: center; }
table[style*="width"] { width: auto; } table[data-fit="auto"] { width: auto; table-layout: auto; }
table[data-talign="center"] { margin-left: auto; margin-right: auto; } table[data-talign="right"] { margin-left: auto; margin-right: 0; }
table[data-line="double"] td, table[data-line="double"] th { border-style: double; border-width: calc(var(--tb-w) + 2px); }
table[data-line="dashed"] td, table[data-line="dashed"] th { border-style: dashed; }
table[data-borders="none"] td, table[data-borders="none"] th, table[data-borders="outer"] td, table[data-borders="outer"] th { border-color: transparent; }
table[data-borders="outer"] { border: var(--tb-w) solid var(--tb-c); }
table[data-borders="inner"] tr:first-child > * { border-top-color: transparent; } table[data-borders="inner"] tr:last-child > * { border-bottom-color: transparent; }
table[data-borders="inner"] tr > :first-child { border-left-color: transparent; } table[data-borders="inner"] tr > :last-child { border-right-color: transparent; }
table[data-borders="hz"] td, table[data-borders="hz"] th { border-left-color: transparent; border-right-color: transparent; }
table[data-tstyle="shade"] th, table[data-tstyle="banded"] th { background: #d9d9d9; }
table[data-banded="true"] tr:nth-child(even) > td:not([data-bg]) { background: #f2f2f2; }
table[data-firstcol="true"] tr > :first-child, table[data-total="true"] tr:last-child > * { font-weight: 700; }
table[data-total="true"] tr:last-child > * { border-top-width: calc(var(--tb-w) + 1px); }
tr[data-keep="true"] { break-inside: avoid; } thead, tr[data-repeat="true"] { break-inside: avoid; }
@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
ul[data-type="taskList"] { list-style: none; padding-left: 0.2in; } ul[data-type="taskList"] li { display: flex; gap: 8px; }
div[data-page-break] { border-top: 1px dashed #999; margin: 12pt 0; }
`;
  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ProNotes">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}
