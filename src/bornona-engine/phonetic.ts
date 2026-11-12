const WORDS: Record<string, string> = {
  amar: 'আমার', amader: 'আমাদের', tumi: 'তুমি', apni: 'আপনি', bangla: 'বাংলা', bhalo: 'ভালো', valo: 'ভালো',
  ain: 'আইন', dalil: 'দলিল', mamla: 'মামলা', jomi: 'জমি', badI: 'বাদী', bibadi: 'বিবাদী',
};
const TOKENS: [string, string][] = [
  ['kh','খ'],['gh','ঘ'],['ch','চ'],['jh','ঝ'],['th','থ'],['dh','ধ'],['ph','ফ'],['bh','ভ'],['sh','শ'],
  ['aa','আ'],['ii','ঈ'],['uu','ঊ'],['oi','ঐ'],['ou','ঔ'],['a','অ'],['i','ই'],['u','উ'],['e','এ'],['o','ও'],
  ['k','ক'],['g','গ'],['j','জ'],['t','ত'],['d','দ'],['n','ন'],['p','প'],['f','ফ'],['b','ব'],['v','ভ'],['m','ম'],
  ['r','র'],['l','ল'],['s','স'],['h','হ'],['y','য'],['w','ও'],['q','ক'],
];

/** Small deterministic lowercase transliterator used by the ProNotes Phonetic layout. */
export function transliterateLowercase(input: string): string {
  const lower = input.toLowerCase();
  if (WORDS[lower]) return WORDS[lower];
  let out = '';
  for (let i = 0; i < lower.length;) {
    if (lower[i] === ' ') { out += ' '; i++; continue; }
    const hit = TOKENS.find(([latin]) => lower.startsWith(latin, i));
    if (!hit) { out += lower[i++]; continue; }
    out += hit[1]; i += hit[0].length;
  }
  return out;
}
