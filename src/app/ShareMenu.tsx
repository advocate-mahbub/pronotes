/** Share / Export menu: every format with Save and (where the device can) Share; copy mode Unicode ⇄ ANSI. */
import { useState } from 'react';
import { useT } from '../i18n';
import { canShareFiles } from '../export/deliver';
import { Popover } from './ui';

export type ExportFormat = 'docx' | 'docx-ansi' | 'doc' | 'doc-ansi' | 'txt' | 'md' | 'html' | 'png';
export type OutputMode = 'unicode' | 'ansi';

interface Props {
  output: OutputMode;
  setOutput: (m: OutputMode) => void;
  onExport: (f: ExportFormat, mode: 'save' | 'share') => void;
  onPrint: () => void;
}

const ROWS: { id: ExportFormat; label: string; note?: string }[] = [
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'docx-ansi', label: 'Word, বিজয় ANSI (.docx)', note: 'বাংলা SutonnyMJ-এ, ইংরেজি আলাদা ফন্টে' },
  { id: 'doc', label: 'Word 97-2003 (.doc)', note: 'পুরোনো Word 2003/2007-এর জন্য' },
  { id: 'doc-ansi', label: 'Word 97-2003, বিজয় ANSI (.doc)' },
  { id: 'txt', label: 'লেখা (.txt)' },
  { id: 'md', label: 'Markdown (.md)' },
  { id: 'html', label: 'ওয়েব পাতা (.html)' },
  { id: 'png', label: 'ছবি (.png)', note: 'প্রতি পাতা একটা ছবি; একাধিক পাতা হলে .zip' },
];

export function ShareMenu({ output, setOutput, onExport, onPrint }: Props) {
  const { t } = useT();
  const [share] = useState(canShareFiles);
  return (
    <Popover label="⤴" title={t('শেয়ার / Export')} testid="share" className="share">
      {(close) => (
        <div className="share-menu" data-testid="share-list">
          <div className="share-mode">
            <span>{t('কপি করলে যাবে')}</span>
            <div className="seg small" role="group" aria-label={t('কপি করলে যাবে')}>
              <button type="button" aria-pressed={output === 'unicode'} data-testid="out-unicode" onClick={() => setOutput('unicode')}>{t('ইউনিকোড')}</button>
              <button type="button" aria-pressed={output === 'ansi'} data-testid="out-ansi" onClick={() => setOutput('ansi')}>{t('বিজয় (ANSI)')}</button>
            </div>
          </div>
          <ul>
            {ROWS.map((r) => (
              <li key={r.id}>
                <span className="fmt">{t(r.label)}{r.note && <small>{t(r.note)}</small>}</span>
                <button type="button" className="btn small" data-testid={'save-' + r.id} onClick={() => { close(); onExport(r.id, 'save'); }}>{t('সেভ')}</button>
                {share && <button type="button" className="btn small" data-testid={'share-' + r.id} onClick={() => { close(); onExport(r.id, 'share'); }}>{t('শেয়ার')}</button>}
              </li>
            ))}
            <li>
              <span className="fmt">{t('PDF / প্রিন্ট')}<small>{t('প্রিন্টের পাতায় “Save as PDF” (iPad-এ Share → Save to Files) বেছে নিন')}</small></span>
              <button type="button" className="btn small" data-testid="print" onClick={() => { close(); onPrint(); }}>{t('প্রিন্ট')}</button>
            </li>
          </ul>
        </div>
      )}
    </Popover>
  );
}
