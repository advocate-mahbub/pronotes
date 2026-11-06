/**
 * Unicode ⇄ Bijoy (SutonnyMJ ANSI). The core converter is the tested v8 library,
 * vendored unchanged in ./vendor. This file adds the v8 helpers for mixed
 * Bangla/English text (bijoyRuns, bijoyFromHtml).
 */
import { toBijoy, toUnicode, looksBijoy } from './vendor/bijoy-lib.js';

export { toBijoy, toUnicode, looksBijoy };

export interface Run {
  /** true = English run (kept as is, English font); false = Bangla run converted to Bijoy. */
  en: boolean;
  text: string;
}

const EN_RUN = /[A-Za-z][A-Za-z0-9@#$%&*_+=/\\.:'"()[\]{}<>?!,;-]*(?:[ \t]+[A-Za-z0-9(][A-Za-z0-9@#$%&*_+=/\\.:'"()[\]{}<>?!,;-]*)*/g;

/** Split Unicode text into English runs and Bangla runs (Bangla converted to Bijoy). v8 `bijoyRuns`. */
export function bijoyRuns(src: string): Run[] {
  const out: Run[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  EN_RUN.lastIndex = 0;
  while ((m = EN_RUN.exec(src))) {
    const s = m.index;
    const txt = m[0];
    if (s > last) out.push({ en: false, text: toBijoy(src.slice(last, s)) });
    out.push({ en: true, text: txt });
    last = s + txt.length;
  }
  if (last < src.length) out.push({ en: false, text: toBijoy(src.slice(last)) });
  return out.filter((r) => r.text);
}

const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Clipboard HTML for Word: Bangla runs in the Bijoy font, English runs in an English font. */
export function runsToClipboardHtml(runs: Run[], bijoyFont: string, englishFont: string): string {
  return (
    '<meta charset="utf-8"><div>' +
    runs
      .map((r) => '<span style="font-family:' + (r.en ? "'" + englishFont + "'" : "'" + bijoyFont + "'") + '">' + escH(r.text).replace(/\n/g, '<br>') + '</span>')
      .join('') +
    '</div>'
  );
}

/**
 * Read clipboard HTML (e.g. copied from Word) and convert only the runs set in a
 * Bijoy/ANSI font. Returns null when no Bijoy-font run is found. v8 `bijoyFromHtml`.
 */
export function bijoyFromHtml(html: string | null | undefined, parser: DOMParser = new DOMParser()): string | null {
  if (!html || !/mj|bijoy|sulekha/i.test(html)) return null;
  const doc = parser.parseFromString(html, 'text/html');
  const rules: [string, string][] = [];
  doc.querySelectorAll('style').forEach((s) => {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.textContent || ''))) {
      const f = /(?:^|[;\s{])font-family:\s*([^;]+)/i.exec(m[2]);
      if (f) rules.push([m[1].trim(), f[1]]);
    }
  });
  const isBj = (f: string) => /(sutonny|sulekha|bijoy|\w+)\s*mj\b|sutonnymj|bijoy/i.test(f) && !/omj/i.test(f);
  const fontOf = (el: Element | null): string => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const sa = e.getAttribute('style') || '';
      const m = /(?:^|;)\s*font-family:\s*([^;]+)/i.exec(sa);
      if (m) return m[1];
      if (e.tagName === 'FONT' && e.getAttribute('face')) return e.getAttribute('face')!;
      for (const [sel, f] of rules) {
        try {
          if (e.matches(sel)) return f;
        } catch {
          /* selector the DOM cannot match, e.g. Word's @page rules */
        }
      }
    }
    return '';
  };
  const BLOCK = /^(P|DIV|LI|H[1-6]|TR|TABLE|UL|OL|BLOCKQUOTE)$/;
  let out = '';
  let found = false;
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      const s = (n.nodeValue || '').replace(/[\r\n]+/g, ' ').replace(/ /g, ' ');
      if (!s) return;
      if (isBj(fontOf(n.parentElement))) {
        found = true;
        out += toUnicode(s);
      } else out += s;
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.tagName === 'HEAD') return;
    el.childNodes.forEach(walk);
    if (BLOCK.test(el.tagName) && !/\n$/.test(out)) out += '\n';
  };
  walk(doc.body);
  return found ? out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '') : null;
}
