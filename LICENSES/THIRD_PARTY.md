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
