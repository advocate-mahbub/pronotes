/**
 * Plain text (.txt) and Markdown (.md) from the editor's JSON. Legal numbered paragraphs keep their
 * numbers ("১।" or "1."), lists keep their markers, tables become tab-separated rows (txt) or
 * Markdown tables (md).
 */
import type { JSONContent } from '@tiptap/core';
import { paraNumber, type DocLang } from '../docx-export/page';
import { isBijoyFont, nodeFont, toUnicode } from '../bijoy';
import { fixNukta } from '../bornona-engine';

export interface TextOptions {
  lang: DocLang;
  legal: boolean;
}

/** Text of a node; text typed in Bijoy (ANSI typing) comes back as Unicode. */
const textOf = (n: JSONContent) => (n.text && isBijoyFont(nodeFont(n as never)) ? fixNukta(toUnicode(n.text)) : n.text ?? '');
const inline = (nodes: JSONContent[] = []) => nodes.map((n) => (n.type === 'hardBreak' ? '\n' : textOf(n))).join('');

/** Markdown for the inline content with bold/italic/strike/sup/sub. */
function inlineMd(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      let s = textOf(n).replace(/([\\`*_[\]#|<>~])/g, '\\$1');
      if (!s.trim()) return s;
      const marks = new Set((n.marks || []).map((m) => m.type));
      if (marks.has('superscript')) s = `<sup>${s}</sup>`;
      if (marks.has('subscript')) s = `<sub>${s}</sub>`;
      if (marks.has('strike')) s = `~~${s}~~`;
      if (marks.has('italic')) s = `*${s}*`;
      if (marks.has('bold')) s = `**${s}**`;
      if (marks.has('underline')) s = `<u>${s}</u>`;
      if (marks.has('highlight')) s = `<mark>${s}</mark>`;
      return s;
    })
    .join('');
}

function walk(nodes: JSONContent[], o: TextOptions, md: boolean, out: string[], counter: { n: number }, depth = 0) {
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph': {
        const text = md ? inlineMd(n.content) : inline(n.content);
        let prefix = '';
        if (o.legal && n.attrs?.pstyle === 'numbered') prefix = paraNumber(++counter.n, o.lang) + (md ? ' ' : '\t');
        let line = prefix + text;
        if (md && o.legal && (n.attrs?.pstyle === 'title' || n.attrs?.pstyle === 'heading')) line = (n.attrs.pstyle === 'title' ? '# ' : '## ') + line;
        else if (md && (n.attrs?.textAlign === 'center' || n.attrs?.pstyle === 'right' || n.attrs?.textAlign === 'right') && text) line = `<p align="${n.attrs?.textAlign === 'center' ? 'center' : 'right'}">${line}</p>`;
        out.push(line);
        break;
      }
      case 'heading': {
        const level = Number(n.attrs?.level ?? 1);
        out.push(md ? '#'.repeat(level) + ' ' + inlineMd(n.content) : inline(n.content));
        break;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (n.content || []).forEach((li, i) => {
          const ind = '  '.repeat(depth);
          const mark =
            n.type === 'bulletList' ? (md ? '-' : '•') : n.type === 'taskList' ? (md ? (li.attrs?.checked ? '- [x]' : '- [ ]') : li.attrs?.checked ? '☑' : '☐') : Number(n.attrs?.start ?? 1) + i + '.';
          const [first, ...rest] = li.content || [];
          out.push(ind + mark + ' ' + (md ? inlineMd(first?.content) : inline(first?.content)));
          const sub: string[] = [];
          walk(rest, o, md, sub, counter, depth + 1);
          out.push(...sub);
        });
        if (md) out.push('');
        break;
      case 'table': {
        const rows = (n.content || []).map((r) => (r.content || []).map((c) => (c.content || []).map((p) => (md ? inlineMd(p.content) : inline(p.content))).join(md ? '<br>' : ' ')));
        if (md) {
          const cols = Math.max(1, ...rows.map((r) => r.length));
          const fmt = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |';
          out.push('', fmt(rows[0] ?? []), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(fmt), '');
        } else out.push(...rows.map((r) => r.join('\t')));
        break;
      }
      case 'pageBreak':
        out.push(md ? '\n---\n' : '\f');
        break;
    }
  }
}

/** Plain text, Windows line endings (Notepad on older Windows shows \n-only files on one line). */
export function toPlainText(doc: JSONContent, o: TextOptions): string {
  const out: string[] = [];
  walk(doc.content || [], o, false, out, { n: 0 });
  return out.join('\r\n');
}

export function toMarkdown(doc: JSONContent, title: string, o: TextOptions): string {
  const out: string[] = [];
  walk(doc.content || [], o, true, out, { n: 0 });
  // paragraphs need a blank line between them in Markdown
  return ('# ' + title + '\n\n' + out.join('\n\n')).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
