import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '..', '..', 'work-layout-source');
const avro = fs.readFileSync(path.join(source, 'UniBijoy.avrolayout'), 'utf8');
const codes = { OEM3:'Backquote', MINUS:'Minus', PLUS:'Equal', OEM4:'BracketLeft', OEM6:'BracketRight', OEM5:'Backslash', OEM1:'Semicolon', OEM7:'Quote', COMMA:'Comma', PERIOD:'Period', OEM2:'Slash' };
const layers = { Normal:0, Shift:1, AltGr:2, ShiftAltGr:3 };
const map = {};
for (const m of avro.matchAll(/<Key_([A-Z0-9]+)_(Normal|Shift|AltGr|ShiftAltGr)>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
  const code = codes[m[1]] || (/^\d$/.test(m[1]) ? 'Digit' + m[1] : /^[A-Z]$/.test(m[1]) ? 'Key' + m[1] : null);
  if (!code) continue;
  const chars = map[code] ??= ['', '', '', ''];
  chars[layers[m[2]]] = m[3].replace(/\r?\n/g, '').trim();
}
for (const m of avro.matchAll(/<Num(\w+)>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g)) map['Numpad' + m[1]] = [m[2].trim()];
const json = JSON.stringify({ id:'unibijoy', name:'UniBijoy', dev:'www.unibijoy.com', map }, null, 2) + '\n';
fs.writeFileSync(path.join(root, 'src', 'bornona-engine', 'approved-unibijoy.json'), json);
