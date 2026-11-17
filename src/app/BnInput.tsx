/**
 * Text boxes that type Bangla with the chosen keyboard layout (the same engine as the editor),
 * for forms outside the editor: the title chart, and anywhere else a plain box needs Bangla.
 */
import { useEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { attachBornona } from './bornona-input';
import type { BornonaConfig } from '../editor';

export interface BnProps { cfg: () => BornonaConfig; toggle: () => void }

export function BnInput({ cfg, toggle, ...rest }: InputHTMLAttributes<HTMLInputElement> & BnProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => (ref.current ? attachBornona(ref.current, cfg, toggle) : undefined), [cfg, toggle]);
  return <input ref={ref} {...rest} />;
}

export function BnTextarea({ cfg, toggle, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & BnProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => (ref.current ? attachBornona(ref.current, cfg, toggle) : undefined), [cfg, toggle]);
  return <textarea ref={ref} {...rest} />;
}
