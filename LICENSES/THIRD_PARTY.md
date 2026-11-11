# Third-party material

| Material | Where | Licence / status |
|---|---|---|
| unicode2ascii 1.1.0 (Md. Nimuzzaman) | `src/bijoy/vendor/bijoy-lib.js` | MIT |
| @codesigntheory/bnbijoy2unicode 1.3.0 | `src/bijoy/vendor/bijoy-lib.js` (patched for ৌ) | MIT |
| Bornona layout (The Safeworks; Unicode version by OmicronLab) | `src/bornona-engine/builtin-layouts.json` | **Redistribution permission not verified** |
| National (Jatiya) layout (Bangladesh Computer Council) | same | **Not verified** |
| Probhat, Munir Optima (uni) layouts (Shabab Mustafa) | same | **Not verified** |
| Avro Easy layout (OmicronLab) | same | **Not verified** |

The owner decided on 2026-11-08 to publish the app on GitHub Pages from a public repository
(decision 46), knowing the layout permissions above are not yet verified. ProNotes' own code is
under `LICENSE` (all rights reserved); that licence does not cover these layouts.
Recommended: ask the layout authors for written permission, or publish a build without the
unverified layouts (users can still add their own `.avrolayout` files).

SutonnyMJ / SutonnyOMJ are commercial fonts (Ananda Computers). They are **not** included;
users upload their own licensed copy in the app.

## M6 যোগ
| জিনিস | লাইসেন্স | কোথায় |
|---|---|---|
| Noto Sans Bengali, Noto Serif Bengali, Hind Siliguri (Fontsource npm প্যাকেজ) | SIL Open Font License 1.1 (ফন্ট), MIT (প্যাকেজ) | অ্যাপের সাথে বান্ডেল, অফলাইনে চলার জন্য |
| vite-plugin-pwa, Workbox | MIT | service worker তৈরি (build-time) ও workbox-window (runtime) |
| html-to-image | MIT | পাতার ছবি (.png) |
| JSZip | MIT (dual MIT/GPLv3, MIT বেছে নেওয়া) | একাধিক ছবির .zip, .docx পড়া/লেখা |

## বাংলা শব্দ-তালিকা (`public/dict/bn-words.txt`)

- উৎস: https://github.com/habibullahnaiem/bangla-spellcheck-dict — `words.txt` (master, ২০২৬-১১-০৯-এ নেওয়া), পরিষ্কার ও য়/ড়/ঢ় এক অক্ষরে করে।
- লাইসেন্স: repo-তে ঘোষণা নেই। repo-র নোট: "শব্দ-বানান তথ্যগত (factual) ডেটা। hunspell bn_BD: LGPL/GPL/MPL ট্রাই-লাইসেন্স।" শব্দের উৎস হিসেবে আরও আছে Banan Andolon অ্যাপ ও বাংলা একাডেমি আধুনিক বাংলা অভিধানের শিরোনাম-শব্দ।
- ProNotes-এ রাখার সিদ্ধান্ত মালিকের (decision 56)। অনুমতি যাচাই হয়নি; নির্মাতার কাছ থেকে লিখিত লাইসেন্স পেলে এখানে যোগ করুন।
- ProNotes-এর "সর্বস্বত্ব সংরক্ষিত" লাইসেন্স এই তালিকায় খাটে না।

## পরীক্ষার ফাইল: Keyman কিবোর্ড (`tests/fixtures/kmx/`)

- `bangla_probhat.kmx`: keymanapp/keyboards-এর `release/b/bangla_probhat` সোর্স থেকে কম্পাইল করা। MIT License, © 2007-2018 Arun Sarkar।
- `basic_kbdinben.kmx`: keymanapp/keyboards-এর `release/basic/basic_kbdinben` থেকে কম্পাইল করা। MIT License, © 2009-2020 SIL International।
- `pn_test.kmn` / `pn_test.kmx`: ProNotes-এর নিজের পরীক্ষার কিবোর্ড।
- শুধু পরীক্ষায় লাগে, অ্যাপের সাথে যায় না। কম্পাইল: `@keymanapp/kmc` 18.0.255 (npm, MIT)।
- OpenBangla Keyboard-এর লেআউট ফাইল (GPL-3.0) রিপোতে রাখা হয়নি; পরীক্ষা নিজে বানানো একই ধাঁচের ফাইল দিয়ে।

