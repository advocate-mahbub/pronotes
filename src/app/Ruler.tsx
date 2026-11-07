/**
 * Horizontal ruler over the page (cm or inch): margins shaded, and the current paragraph's
 * first-line, left (with hanging) and right indent markers, which can be dragged.
 */
import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { effectiveIndent } from '../editor';
import { useT } from '../i18n';

interface Props {
  editor: Editor;
  /** unzoomed px */
  pageW: number;
  ml: number;
  mr: number;
  zoom: number;
  unit: 'cm' | 'in';
  legal: boolean;
}

const PX_PER: Record<'cm' | 'in', number> = { cm: 96 / 2.54, in: 96 };
const TW_PER_PX = 15;

export function Ruler({ editor, pageW, ml, mr, zoom, unit, legal }: Props) {
  const { t } = useT();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);
  const bar = useRef<HTMLDivElement>(null);
  const attrs = editor.state.selection.$from.parent.attrs as Record<string, unknown>;
  const ind = effectiveIndent(attrs, legal);
  const textW = pageW - ml - mr;
  const firstX = ml + (ind.indL + ind.first) / TW_PER_PX;
  const leftX = ml + ind.indL / TW_PER_PX;
  const rightX = pageW - mr - ind.indR / TW_PER_PX;
  const step = PX_PER[unit];
  const snap = unit === 'cm' ? step / 4 : step / 8;

  /** Drag a marker; `apply` gets the new x (unzoomed px from the page edge). */
  const drag = (apply: (x: number) => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = bar.current!;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.round(((ev.clientX - r.left) / zoom - ml) / snap) * snap + ml;
      apply(Math.max(0, Math.min(pageW, x)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const set = (a: Record<string, number | null>) => editor.chain().setParagraphFormat(a).run();
  const tw = (px: number) => Math.round(px * TW_PER_PX);

  const ticks: React.ReactNode[] = [];
  for (let i = 1; ml + i * step < pageW - mr + 0.5; i++) ticks.push(<span key={'p' + i} className="rl-num" style={{ left: (ml + i * step) * zoom }}>{i}</span>);
  for (let i = 1; ml - i * step > 0; i++) ticks.push(<span key={'n' + i} className="rl-num" style={{ left: (ml - i * step) * zoom }}>{i}</span>);

  return (
    <div className="ruler" ref={bar} data-testid="ruler" style={{ width: pageW * zoom, ['--tick' as string]: step * zoom + 'px', ['--minor' as string]: (unit === 'cm' ? step / 4 : step / 8) * zoom + 'px', ['--ml' as string]: ml * zoom + 'px' } as React.CSSProperties}>
      <span className="rl-margin" style={{ left: 0, width: ml * zoom }} />
      <span className="rl-margin" style={{ right: 0, width: mr * zoom }} />
      <span className="rl-text" style={{ left: ml * zoom, width: textW * zoom }} />
      {ticks}
      <span className="rl-mark first" data-testid="ruler-first" title={t('প্রথম লাইনের indent')} style={{ left: firstX * zoom }}
        onPointerDown={drag((x) => set({ first: tw(x - leftX) }))} />
      <span className="rl-mark hang" data-testid="ruler-hanging" title={t('ঝুলন্ত indent')} style={{ left: leftX * zoom }}
        onPointerDown={drag((x) => set({ indL: tw(x - ml), first: tw(firstX - x) }))} />
      <span className="rl-mark left" data-testid="ruler-left" title={t('বাম indent')} style={{ left: leftX * zoom }}
        onPointerDown={drag((x) => set({ indL: tw(x - ml), first: ind.first }))} />
      <span className="rl-mark right" data-testid="ruler-right" title={t('ডান indent')} style={{ left: rightX * zoom }}
        onPointerDown={drag((x) => set({ indR: tw(pageW - mr - x) }))} />
    </div>
  );
}
