import type { Layout, LayoutMap } from './layouts';
import { fixNukta } from './normalize';

const AVRO2CODE: Record<string, string> = {
  OEM3: 'Backquote', MINUS: 'Minus', PLUS: 'Equal', OEM4: 'BracketLeft', OEM6: 'BracketRight', OEM5: 'Backslash',
  OEM1: 'Semicolon', OEM7: 'Quote', COMMA: 'Comma', PERIOD: 'Period', OEM2: 'Slash',
};
const LAYER: Record<string, number> = { Normal: 0, Shift: 1, AltGr: 2, ShiftAltGr: 3 };

const ent = (s: string) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Parse an Avro Keyboard layout file (.avrolayout, XML) into a Layout without an id.
 * Same rules as v8 `parseAvro`. Throws when the file has no usable key data.
 */
export function parseAvroLayout(txt: string): Omit<Layout, 'id'> {
  const get = (tag: string) => {
    const m = txt.match(new RegExp('<' + tag + '>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>'));
    return m ? ent(m[1]).trim() : '';
  };
  const i = txt.indexOf('<KeyData>');
  if (i < 0) throw new Error('no KeyData');
  const kd = txt.slice(i);
  const map: LayoutMap = {};
  let n = 0;
  let m: RegExpExecArray | null;
  const re = /<Key_([A-Z0-9]+)_(Normal|Shift|AltGr|ShiftAltGr)>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g;
  while ((m = re.exec(kd))) {
    const k = m[1];
    const code = AVRO2CODE[k] || (/^\d$/.test(k) ? 'Digit' + k : /^[A-Z]$/.test(k) ? 'Key' + k : '');
    if (!code) continue;
    (map[code] = map[code] || ['', '', '', ''])[LAYER[m[2]]] = fixNukta(ent(m[3]));
    n++;
  }
  const re2 = /<Num(\w+)>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g;
  while ((m = re2.exec(kd))) map['Numpad' + m[1]] = [fixNukta(ent(m[2]))];
  if (n < 40) throw new Error('too few keys');
  return { name: get('LayoutName') || 'নিজের লেআউট', dev: get('DeveloperName'), map };
}
