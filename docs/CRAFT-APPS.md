# ProNotes-এ Craft অ্যাপস (WordCraft, PdfCraft, GridCraft, DeckCraft)

উপরের বারে **▦** চাপলে "অ্যাপস" খোলে। `notes.mahbuburrahman.bd/word` সরাসরি WordCraft খোলে।

## কীভাবে কাজ করে
- প্রতিটি অ্যাপ ArtCraft-এর অফিসিয়াল web build, **অপরিবর্তিত**। ঠিকানা: `/apps/<id>/<version>/`।
- ZIP কখনো git-এ commit হয় না। `deploy.yml` build-এর পর `npm run craft:dist` চালায়: GitHub release থেকে zip নামায়, `apps.json`-এর SHA-256 মিলায়, `dist/apps/`-এ খোলে।
- অ্যাপ same-origin iframe-এ `?host=parent` দিয়ে চলে। Save/Save As/Export করলে ফাইল আসে ProNotes-এ, রাখা হয় আলাদা IndexedDB `pronotes-craft`-এ। ProNotes-এর মূল database (`pronotes`), ব্যাকআপ, editor, কিবোর্ড — কিছুই বদলায়নি।
- PdfCraft 0.21.1-এ এখনো `?host=parent` নেই (`bridge: "none"`): ওখানে Save মানে সাধারণ ডাউনলোড।
- Service worker অ্যাপগুলো precache করে না (৬০ MB-এর wasm), আর `/apps/`, `/word/` ঠিকানায় ProNotes-এর index.html বসায় না।

## নতুন version / নতুন অ্যাপ
- `craft-update.yml` প্রতিদিন GitHub-এ খোঁজে, পেলে `src/craft/apps.json` বদলে **PR খোলে**। merge না করা পর্যন্ত live সাইটে কিছু বদলায় না।
- নতুন অ্যাপ আসে `"enabled": false` অবস্থায়। iPad-এ পরীক্ষা করে `true` করুন, `bridge` ঠিক করুন (`HOSTING.md`-এ `?host=parent` থাকলে `"parent"`)।
- একবারের সেটআপ: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"।

## কম্পিউটারে চালানো
```
npm ci
npm run craft:fetch   # public/apps/-এ অ্যাপ (git-ignored)
npm run dev
```

## সীমা
- আকার: ৪টি অ্যাপ মিলে ≈১৯০ MB; GitHub Pages-এর সীমা ১ GB। `fetch-craft-apps.mjs` ৭০০ MB বা কোনো ফাইল ১০০ MiB পার হলে build থামায়।
- Cloudflare Pages-এ গেলে সমস্যা: সেখানে প্রতি ফাইল ২৫ MiB সীমা, অথচ WordCraft আর PdfCraft-এর wasm ≈৫৮ MiB।
- **বাংলা:** অ্যাপগুলোর ভেতরের ফন্টে বাংলা নেই। ডকুমেন্টে বাংলা লিখলে বাক্স (□) দেখায় — Bengali system font ছাড়া Chrome-এ পরীক্ষা করে নিশ্চিত হওয়া গেছে; iPad Safari-তেও একই হওয়ার কথা। ProNotes-এর ফন্ট (CSS/IndexedDB) অ্যাপের canvas engine পর্যন্ত পৌঁছায় না, ZIP-এ ফন্ট রাখলেও অ্যাপ পড়ে না। তাই আইনি খসড়ার মূল কাজ ProNotes editor-এই থাকবে।
- কিবোর্ড: `bridge.ts`-এ `insertText()` তৈরি আছে (অ্যাপের `text.insert`), কিন্তু ProNotes কিবোর্ডের সাথে এখনো যুক্ত করা হয়নি — বাংলা ফন্ট সমস্যা মেটার পর।
