import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { bijoyRuns, bijoyFromHtml, runsToClipboardHtml, toUnicode, PASTE_MSG_HTML, type Run } from '../bijoy';
import { insertPlainText } from '../editor';

interface Props {
  editor: Editor;
  /** Bijoy font for the preview and for Word ('' = show the raw ANSI letters). */
  ansiFont: string;
  enFont: string;
  say: (m: string) => void;
}

/** Unicode → Bijoy (rich copy for Word) and Bijoy → Unicode (insert at the caret). Ported from v8. */
export function BijoyPanel({ editor, ansiFont, enFont, say }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [input, setInput] = useState('');
  const out = useRef<HTMLDivElement>(null);
  const wordFont = ansiFont || 'SutonnyMJ';

  const toBijoy = () => {
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const src = empty ? state.doc.textBetween(0, state.doc.content.size, '\n', ' ') : state.doc.textBetween(from, to, '\n', ' ');
    if (!src.trim()) return say('বদলানোর মতো লেখা নেই');
    const r = bijoyRuns(src);
    setRuns(r);
    const plain = r.map((x) => x.text).join('');
    const html = runsToClipboardHtml(r, wordFont, enFont);
    const part = empty ? 'পুরো লেখা' : 'সিলেক্ট করা অংশ';
    const ok = () => say(`${part} বিজয়ে কপি হয়েছে। Word-এ পেস্ট করলে বাংলা ${wordFont}, ইংরেজি ${enFont} ফন্টে বসবে।`);
    const selectPreview = () =>
      requestAnimationFrame(() => {
        if (!out.current) return;
        const range = document.createRange();
        range.selectNodeContents(out.current);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        say('লেখা সিলেক্ট করা আছে, এখন Copy করুন');
      });
    const plainOnly = () =>
      navigator.clipboard.writeText(plain).then(() => say('বিজয়ে কপি হয়েছে (ফন্ট ছাড়া)। Word-এ বাংলা অংশে SutonnyMJ দিন।'), selectPreview);
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        navigator.clipboard
          .write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
          .then(ok, () => plainOnly().catch(selectPreview));
      } else if (navigator.clipboard) plainOnly().catch(selectPreview);
      else selectPreview();
    } catch {
      selectPreview();
    }
  };

  const insert = (u: string) => {
    editor.commands.focus();
    const before = editor.state.selection.$from.parent.textBetween(0, editor.state.selection.$from.parentOffset);
    insertPlainText(editor.view, (before && !/\s$/.test(before) ? ' ' : '') + u);
  };
  const toUni = () => {
    if (!input.trim()) return say('আগে বিজয় লেখা পেস্ট করুন');
    insert(toUnicode(input));
    setInput('');
    say('ইউনিকোডে বদলে বসানো হয়েছে');
  };

  return (
    <section className="conv" aria-label="ইউনিকোড ⇄ বিজয়" data-testid="bijoy-panel">
      <div>
        <h3>ইউনিকোড → বিজয় (ANSI)</h3>
        <p className="note">পুরো লেখা, বা সিলেক্ট করা অংশ, বিজয়ে বদলে কপি হবে। Word-এ পেস্ট করলে বাংলা অংশ {wordFont} আর ইংরেজি অংশ {enFont} ফন্টে নিজে থেকে বসবে।</p>
        <div ref={out} className={'bjprev' + (ansiFont ? ' ansi' : '')} tabIndex={0} data-testid="bijoy-out" data-ph="বিজয় লেখা এখানে দেখাবে"
          style={ansiFont ? ({ ['--f-ansi' as string]: `"${ansiFont}"` } as React.CSSProperties) : undefined}>
          {runs.map((r, i) => <span key={i} className={r.en ? 'en' : 'bn'}>{r.text}</span>)}
        </div>
        <button type="button" className="btn primary" data-testid="to-bijoy" onPointerDown={(e) => e.preventDefault()} onClick={toBijoy}>বিজয়ে বদলে কপি করুন</button>
      </div>
      <div>
        <h3>বিজয় → ইউনিকোড</h3>
        <p className="note">Word থেকে কপি করে এখানে বা সরাসরি লেখার পাতায় পেস্ট করুন। শুধু SutonnyMJ ফন্টের অংশ বদলাবে, ইংরেজি অংশ যেমন আছে থাকবে। ফন্টের তথ্য ছাড়া সাদা লেখা হলে সবটাই বিজয় ধরে বদলাবে।</p>
        <textarea data-testid="bijoy-in" spellCheck={false} placeholder="Avgvi †mvbvi evsjv" value={input} onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const u = bijoyFromHtml(e.clipboardData.getData('text/html'));
            if (u === null) return;
            e.preventDefault();
            insert(u);
            say(PASTE_MSG_HTML);
          }} />
        <button type="button" className="btn primary" data-testid="to-unicode" onClick={toUni}>ইউনিকোডে বদলে বসান</button>
      </div>
    </section>
  );
}
