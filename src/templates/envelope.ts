/**
 * Envelope template: sender at the top left, recipient lower and to the right.
 * Only placeholders in square brackets; no personal data is stored in the app.
 */
import type { JSONContent } from '@tiptap/core';

const para = (text: string, indL: number | null = null, bold = false): JSONContent => ({
  type: 'paragraph',
  attrs: { indL, spAfter: 0, spBefore: 0, lineRule: 'auto', lineVal: 1 },
  content: text ? [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] : undefined,
});

/** Recipient block starts this far from the left margin (3.25 inch, in twips). */
export const RECIPIENT_INDENT = 4680;

export function envelopeContent(lang: 'bn' | 'en' = 'bn'): JSONContent {
  const L = lang === 'bn'
    ? { from: 'প্রেরক:', to: 'প্রাপক:', name: '[নাম]', addr: '[ঠিকানা]', area: '[থানা/উপজেলা, জেলা]', sname: '[আপনার নাম], অ্যাডভোকেট', chamber: '[চেম্বারের ঠিকানা]', phone: '[মোবাইল]' }
    : { from: 'From:', to: 'To:', name: '[Name]', addr: '[Address]', area: '[Area, District]', sname: '[Your name], Advocate', chamber: '[Chamber address]', phone: '[Mobile]' };
  return {
    type: 'doc',
    content: [
      para(L.from, null, true),
      para(L.sname),
      para(L.chamber),
      para(L.phone),
      para(''),
      para(''),
      para(L.to, RECIPIENT_INDENT, true),
      para(L.name, RECIPIENT_INDENT),
      para(L.addr, RECIPIENT_INDENT),
      para(L.area, RECIPIENT_INDENT),
    ],
  };
}

export const envelopeText = (c: JSONContent) => (c.content ?? []).map((p) => (p.content ?? []).map((n) => n.text ?? '').join('')).join('\n');
