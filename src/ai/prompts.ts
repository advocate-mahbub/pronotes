/**
 * Ready-made instructions for the AI assistant. The text sent always carries placeholders
 * instead of private details, and the model is told to keep them as they are.
 */
export type Task = 'polish' | 'paragraphs' | 'formal' | 'summary' | 'to-en' | 'to-bn' | 'custom';

export const TASKS: { id: Task; label: string }[] = [
  { id: 'polish', label: 'ভাষা ঘষামাজা (অর্থ না বদলে)' },
  { id: 'paragraphs', label: 'নম্বর দেওয়া অনুচ্ছেদে সাজান' },
  { id: 'formal', label: 'আদালতের ভাষায় লিখুন' },
  { id: 'summary', label: 'সংক্ষেপ করুন' },
  { id: 'to-en', label: 'ইংরেজিতে অনুবাদ' },
  { id: 'to-bn', label: 'বাংলায় অনুবাদ' },
  { id: 'custom', label: 'নিজের নির্দেশ' },
];

const RULES = [
  'বাংলাদেশের আদালতে ব্যবহৃত প্রমিত বাংলা লিখবেন; পশ্চিমবঙ্গের শব্দ নয় (যেমন "পানি", "জল" নয়)।',
  'কেউ সম্পত্তি পেলে/কিনলে "দলিল মূলে" (যেমন "... দলিল মূলে খরিদ করেন"), কেউ হস্তান্তর করলে "দলিল দ্বারা" (যেমন "... দলিল দ্বারা বিক্রয় করেন") লিখবেন।',
  'বর্গবন্ধনীর ভেতরের চিহ্ন, যেমন [ব্যক্তি-১], [দাগ-২], হুবহু রাখবেন; বদলাবেন না, অনুবাদ করবেন না, বাদ দেবেন না।',
  'কোনো আইন, ধারা, মামলার নজির, তারিখ বা তথ্য বানাবেন না; মূল লেখায় যা নেই তা যোগ করবেন না।',
  'উত্তরে শুধু তৈরি লেখাটা দেবেন; কোনো ভূমিকা, ব্যাখ্যা বা মন্তব্য নয়। Markdown চিহ্ন (**, #) ব্যবহার করবেন না।',
];

const TASK_TEXT: Record<Exclude<Task, 'custom'>, string> = {
  polish: 'নিচের লেখার ভাষা ঘষামাজা করুন: বানান, বাক্যগঠন ও যতিচিহ্ন ঠিক করুন, অর্থ ও তথ্য একই রাখুন।',
  paragraphs: 'নিচের লেখাকে আরজি/দরখাস্তের মতো নম্বর দেওয়া অনুচ্ছেদে (১।, ২। …) সাজান; প্রতিটা অনুচ্ছেদে একটা মূল বিষয়।',
  formal: 'নিচের লেখা বাংলাদেশের দেওয়ানি আদালতের আরজি/দরখাস্তের প্রচলিত ভাষায় নতুন করে লিখুন; তথ্য একই রাখুন।',
  summary: 'নিচের লেখার মূল তথ্যগুলো অল্প কথায়, ক্রমানুসারে সংক্ষেপ করুন।',
  'to-en': 'Translate the text below into formal legal English as used in Bangladeshi courts. Keep every placeholder in square brackets exactly as it is.',
  'to-bn': 'নিচের ইংরেজি লেখা বাংলাদেশের আদালতের প্রমিত বাংলায় অনুবাদ করুন।',
};

/** The full message for the model (or to paste into Claude). */
export function buildPrompt(task: Task, text: string, custom = ''): string {
  const ask = task === 'custom' ? custom.trim() || TASK_TEXT.polish : TASK_TEXT[task];
  return [
    'আপনি বাংলাদেশের একজন অ্যাডভোকেটের ড্রাফটিং সহকারী।',
    ...RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    ask,
    '',
    '---',
    text,
    '---',
  ].join('\n');
}

/** Remove what models add around the answer (``` fences, a leading "Here is …" line, markdown bold). */
export function cleanAnswer(s: string): string {
  return s
    .replace(/^\s*```[a-z]*\n?|\n?```\s*$/g, '')
    .replace(/^\s*---\s*\n|\n\s*---\s*$/g, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .trim();
}
