/**
 * Adding a keyboard layout from a file: Avro (.avrolayout), OpenBangla Keyboard (.json),
 * Keyman (.kmx, or a .kmp package that holds .kmx files). The kind is read from the file's content,
 * not its name. Nothing leaves the device.
 */
import { parseAvroLayout, parseOpenBanglaLayout, parseKMX, kmxIsSimple, kmxKeyLabels, fixNukta, type Layout, type KmxKeyboard } from '../bornona-engine';
import { toUnicode } from '../bijoy';

export type NewLayout = Omit<Layout, 'id'> & { notes: string[]; format?: 'avro' | 'openbangla' | 'kmx'; kmx?: KmxKeyboard };

/** Messages for the user (Bangla; translated by the interface). */
export const LAYOUT_MSG = {
  big: 'ফাইলটা অনেক বড়',
  kmx: 'Keyman ফাইলটা (.kmx) পড়া গেল না',
  kmpOpen: 'Keyman প্যাকেজটা (.kmp) খোলা গেল না',
  kmpEmpty: 'এই প্যাকেজে কোনো .kmx কিবোর্ড নেই (শুধু টাচ/ওয়েব কিবোর্ড ProNotes চালাতে পারে না)',
  kmpBad: 'Keyman প্যাকেজের কিবোর্ড পড়া গেল না',
  json: 'OpenBangla লেআউট (.json) হিসেবে পড়া গেল না (শুধু "fixed" লেআউট চলে)',
  unknown: 'ফাইলটা লেআউট হিসেবে পড়া গেল না: .avrolayout, OpenBangla .json, Keyman .kmx বা .kmp দিন',
};
const MSG = LAYOUT_MSG;

const MAX_BYTES = 8 * 1024 * 1024;

function fromKmx(buf: ArrayBuffer): NewLayout {
  const kb = parseKMX(buf);
  const dev = kb.copyright.replace(/^©\s*/, '');
  if (kmxIsSimple(kb)) {
    // one key → fixed text: used like any layout map, so vowel forming and the reph setting apply
    return { name: kb.name, dev, map: kmxKeyLabels(kb), format: 'kmx', notes: kb.unsupported };
  }
  const labels = kmxKeyLabels(kb);
  if (kb.enc === 'ansi') {
    // labels readable as Bangla (the keys type Bijoy text)
    for (const c in labels) labels[c] = labels[c].map((s) => (s ? fixNukta(toUnicode(s)) : s));
  }
  return { name: kb.name, dev, map: labels, format: 'kmx', kmx: kb, notes: kb.unsupported };
}

/** Read one file into one or more layouts. Throws Error with a Bangla message for the user. */
export async function readLayoutFile(file: File): Promise<NewLayout[]> {
  if (file.size > MAX_BYTES) throw new Error(MSG.big);
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf.slice(0, 4));
  const tag = String.fromCharCode(...b);
  if (tag === 'KXTS') {
    try {
      return [fromKmx(buf)];
    } catch {
      throw new Error(MSG.kmx);
    }
  }
  if (tag.startsWith('PK')) {
    const JSZip = (await import('jszip')).default;
    let zip: InstanceType<typeof JSZip>;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      throw new Error(MSG.kmpOpen);
    }
    const files = Object.values(zip.files).filter((f) => !f.dir && /\.kmx$/i.test(f.name));
    if (!files.length) throw new Error(MSG.kmpEmpty);
    const out: NewLayout[] = [];
    for (const f of files) {
      try {
        out.push(fromKmx(await f.async('arraybuffer')));
      } catch {
        /* one unreadable keyboard in the package: skip it */
      }
    }
    if (!out.length) throw new Error(MSG.kmpBad);
    return out;
  }
  const txt = new TextDecoder('utf-8').decode(buf);
  if (/^\s*[{[]/.test(txt.replace(/^\uFEFF/, ''))) {
    try {
      return [{ ...parseOpenBanglaLayout(txt), format: 'openbangla', notes: [] }];
    } catch {
      throw new Error(MSG.json);
    }
  }
  try {
    return [{ ...parseAvroLayout(txt), format: 'avro', notes: [] }];
  } catch {
    throw new Error(MSG.unknown);
  }
}

export const LAYOUT_ACCEPT = '.avrolayout,.xml,text/xml,.json,application/json,.kmx,.kmp';
