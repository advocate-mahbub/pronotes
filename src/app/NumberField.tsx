/**
 * A number box that lets you write freely (decisions.md 78). The old boxes put the default back the
 * moment they were empty, so the last digit could not be deleted ("২৩" → "২" stuck), and they took no
 * Bangla digits, so ProNotes' own keyboard could not fill them. Here the box keeps what you write; a
 * whole value inside the limits is used at once, anything else goes back to the last good value when
 * you leave the box (Enter leaves it, Esc puts it back). − and + step it.
 */
import { useEffect, useState } from 'react';
import { num, useT } from '../i18n';

const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/[٫,]/g, '.');

export function parseNumber(s: string, min: number, max: number): number | null {
  const t = toAscii(s.trim());
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

interface Props {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  testid?: string;
  /** − and + beside the box. */
  steppers?: boolean;
  label?: string;
}

export function NumberField({ value, onChange, min, max, step = 1, testid, steppers = false, label }: Props) {
  const { lang } = useT();
  const show = (n: number) => num(String(n), lang);
  const [draft, setDraft] = useState(show(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(show(value)); }, [value, editing, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const bump = (d: number) => {
    const n = Math.round(Math.min(max, Math.max(min, value + d)) * 100) / 100;
    if (n !== value) onChange(n);
    setDraft(show(n));
  };
  return (
    <span className={'numfield' + (steppers ? ' steps' : '')}>
      {steppers && <button type="button" className="btn small" aria-label="−" data-testid={testid && testid + '-minus'} onClick={() => bump(-step)}>−</button>}
      <input type="text" inputMode="decimal" className="num" data-testid={testid} aria-label={label} value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseNumber(e.target.value, min, max);
          if (n !== null && n !== value) onChange(n);
        }}
        onBlur={() => { setEditing(false); const n = parseNumber(draft, min, max); setDraft(show(n ?? value)); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(show(value)); setEditing(false); (e.target as HTMLInputElement).blur(); }
        }} />
      {steppers && <button type="button" className="btn small" aria-label="+" data-testid={testid && testid + '-plus'} onClick={() => bump(step)}>+</button>}
    </span>
  );
}
