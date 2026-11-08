# ProNotes

iPad-এ, internet ছাড়াও চলে এমন বাংলা আইনি ড্রাফটিং অ্যাপ (PWA)। Bornona সহ ৫টা কিবোর্ড লেআউট, শব্দের পরামর্শ,
ভয়েস টাইপিং, বিজয় ⇄ ইউনিকোড, আর আদালতের ফরম্যাটে `.docx`।

> অবস্থা: **v2.0, ধাপ ৫** — M6 পর্যন্ত সব + ribbon, দুই ধরনের ডকুমেন্ট, অ্যাপের ভাষা, আলো/অন্ধকার (ধাপ ১) + পাতা সেটআপ, Print Layout,
> Ruler, Gridlines (ধাপ ২) + শেয়ার/Export: .docx, .doc, বিজয় ANSI, .txt, .md, .html, .png, PDF; কপি ইউনিকোড ⇄ ANSI (ধাপ ৩) + Converter (টাকা কথায়, সংখ্যা, ভাঙা লেখা ঠিক), বিজয়ে টাইপ (পরীক্ষামূলক), খাম (ধাপ ৪) + AI সহকারী: Claude (কপি-পেস্ট) ও Gemini ফ্রি API, নাম লুকিয়ে (ধাপ ৫)।
> পরের ধাপ: টেবিলের সরঞ্জাম, তারপর টাইটেল চার্ট (v2.2)। সাইটে বসানো এখনো হয়নি — `docs/DEPLOY.md` দেখুন।

## চালানো

Node.js 22 লাগবে।

```bash
npm install          # প্রথমবার
npm run dev          # http://localhost:5173 এ খুলবে
npm test             # unit test
npm run build        # dist/ ফোল্ডারে তৈরি
npm run test:e2e     # ব্রাউজার test (প্রথমবার: npx playwright install chromium webkit)
```

## GitHub ও সাইটে বসানো

- GitHub-এ private repo বানিয়ে তোলা: [`docs/GITHUB.md`](docs/GITHUB.md)
- সাইটে বসানো (GitHub Pages → `pronotes.mahbuburrahman.bd`): [`docs/DEPLOY.md`](docs/DEPLOY.md)
- বসানোর পর iPad-এ পরীক্ষা: [`docs/ipad-checklist.md`](docs/ipad-checklist.md)
- প্রতিটা push-এ GitHub টাইপ, unit test ও build পরীক্ষা করে: `.github/workflows/ci.yml`
- `main`-এ push হলে test পাস করলে GitHub Pages-এ বসে: `.github/workflows/deploy.yml`
- নিরাপত্তা: production build-এর `index.html`-এ CSP `<meta>`; `public/_headers` শুধু Cloudflare/Netlify-তে কাজে লাগে


## ফোল্ডার

| ফোল্ডার | কী আছে |
|---|---|
| `src/bornona-engine` | কিবোর্ড engine: লেআউট, স্বর-গঠন, রেফ, `.avrolayout` পড়া, য়/ড়/ঢ় normalisation। কোনো UI নির্ভরতা নেই। |
| `src/bijoy` | ইউনিকোড ⇄ বিজয় (SutonnyMJ), ইংরেজি না ভেঙে copy/paste |
| `src/suggest` | শব্দভান্ডার, পরামর্শ, শেখা |
| `src/editor` | Tiptap editor + Bornona extension |
| `src/export` | .doc (RTF), .txt, .md, .html, .png তৈরি, ফাইল সেভ/শেয়ার |
| `src/docx-export` | আদালতের ফরম্যাটে .docx (Legal কাগজ, মার্জিন, অনুচ্ছেদ-ধরন, তফসিল, পাতা নম্বর) |
| `src/storage` | IndexedDB: ড্রাফট, ট্র্যাশ (৩০ দিন), শব্দভান্ডার, নিজের লেআউট ও ফন্ট, পূর্ণ ব্যাকআপ/ফেরত আনা |
| `src/voice` | ভয়েস টাইপিং: v8-এর যতিচিহ্ন/সংখ্যা/সংশোধন নিয়ম, Web Speech নিয়ন্ত্রণ, iPad-এ ডিভাইস-কিবোর্ড বিকল্প |
| `src/fonts` | নিজের ফন্ট ফাইল: নাম পড়া, FontFace-এ বসানো, ইনস্টল করা ফন্ট চেনা |
| `src/app` | UI: ribbon, ফন্ট/অনুচ্ছেদ প্যানেল, খুঁজুন ও বদলান, পরামর্শের সারি, অন-স্ক্রিন কিবোর্ড, সেটিংস, Converter, মাইক |
| `src/i18n` | অ্যাপের ভাষা: বাংলা লেখাই key, `en.ts`-এ ইংরেজি |
| `reference/` | বর্ণনা প্যাড v8, আচরণের মাপকাঠি। বদলাবেন না। |
| `tests/golden` | v8 থেকে রেকর্ড করা আচরণ (`npm run golden`) |
| `docs/decisions.md` | সিদ্ধান্তের খাতা |

## নিয়ম

- বাংলা লেখা সবসময় Unicode; য় ড় ঢ় এক অক্ষরে (U+09DF/09DC/09DD)। কোথাও `normalize('NFC')` চালাবেন না।
- সোর্স ফাইলে কোনো "Unicode normalise" টুল চালাবেন না: `src/bornona-engine/normalize.ts`-এর ভেতরে ইচ্ছাকৃতভাবে ভাঙা রূপ লেখা আছে।
- মক্কেলের আসল তথ্য repo-তে বা test-এ রাখবেন না।
- লাইসেন্স: `LICENSES/THIRD_PARTY.md` দেখুন। লেআউটের অনুমতি যাচাই না হওয়া পর্যন্ত repo private।

## লাইসেন্স

© ২০২৬ মাহবুবুর রহমান। সর্বস্বত্ব সংরক্ষিত। শর্ত: [`LICENSE`](LICENSE) (বাংলা পাঠ: `public/license.html`)। ভেতরের অন্যদের অংশের লাইসেন্স: [`LICENSES/THIRD_PARTY.md`](LICENSES/THIRD_PARTY.md)।
