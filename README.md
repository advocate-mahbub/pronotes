# ProNotes

iPad-এ, internet ছাড়াও চলে এমন বাংলা আইনি ড্রাফটিং অ্যাপ (PWA)। Bornona সহ ৫টা কিবোর্ড লেআউট, শব্দের পরামর্শ,
ভয়েস টাইপিং, বিজয় ⇄ ইউনিকোড, আর আদালতের ফরম্যাটে `.docx`।

> অবস্থা: **M1** (কিবোর্ড engine, বিজয় রূপান্তর, শব্দের পরামর্শ — বর্ণনা প্যাড v8 থেকে আনা ও পরীক্ষিত)।
> Editor, ডকুমেন্ট, .docx আর PWA পরের milestone-এ।

## চালানো

Node.js 22 লাগবে।

```bash
npm install          # প্রথমবার
npm run dev          # http://localhost:5173 এ খুলবে
npm test             # unit test
npm run build        # dist/ ফোল্ডারে তৈরি
npm run test:e2e     # ব্রাউজার test (প্রথমবার: npx playwright install chromium webkit)
```

## ফোল্ডার

| ফোল্ডার | কী আছে |
|---|---|
| `src/bornona-engine` | কিবোর্ড engine: লেআউট, স্বর-গঠন, রেফ, `.avrolayout` পড়া, য়/ড়/ঢ় normalisation। কোনো UI নির্ভরতা নেই। |
| `src/bijoy` | ইউনিকোড ⇄ বিজয় (SutonnyMJ), ইংরেজি না ভেঙে copy/paste |
| `src/suggest` | শব্দভান্ডার, পরামর্শ, শেখা |
| `src/app` | UI (এখন শুধু engine-এর preview) |
| `reference/` | বর্ণনা প্যাড v8, আচরণের মাপকাঠি। বদলাবেন না। |
| `tests/golden` | v8 থেকে রেকর্ড করা আচরণ (`npm run golden`) |
| `docs/decisions.md` | সিদ্ধান্তের খাতা |

## নিয়ম

- বাংলা লেখা সবসময় Unicode; য় ড় ঢ় এক অক্ষরে (U+09DF/09DC/09DD)। কোথাও `normalize('NFC')` চালাবেন না।
- সোর্স ফাইলে কোনো "Unicode normalise" টুল চালাবেন না: `src/bornona-engine/normalize.ts`-এর ভেতরে ইচ্ছাকৃতভাবে ভাঙা রূপ লেখা আছে।
- মক্কেলের আসল তথ্য repo-তে বা test-এ রাখবেন না।
- লাইসেন্স: `LICENSES/THIRD_PARTY.md` দেখুন। লেআউটের অনুমতি যাচাই না হওয়া পর্যন্ত repo private।
