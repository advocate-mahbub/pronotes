# ProNotes সাইটে বসানো (deploy)

ProNotes একটা স্থির (static) PWA:

- কোনো সার্ভার বা ডেটাবেস লাগে না। সব লেখা ব্যবহারকারীর নিজের ডিভাইসে (IndexedDB) থাকে।
- সাইটে শুধু `npm run build`-এর তৈরি `dist/` ফোল্ডারটা রাখতে হয়।
- অফলাইন আর "হোম স্ক্রিনে যোগ" চালু হতে **https** লাগে।

> **বসানোর আগে লাইসেন্স।** সাইটে তুললে অ্যাপের ফাইল যে কেউ ডাউনলোড করতে পারে, তাই ভেতরের কিবোর্ড লেআউটগুলোও বিলি হয়ে যায়।
> Bornona, National, Probhat, Munir Optima, Avro Easy — কোনোটার অনুমতি এখনো যাচাই হয়নি (`LICENSES/THIRD_PARTY.md`)।
> যতক্ষণ যাচাই না হয়, দুটো পথ আছে:
> 1. সাইটের ঠিকানা কাউকে দেবেন না। `noindex` দেওয়া আছে, তাই Google-এ আসবে না। তবে ঠিকানা জানলে যে কেউ খুলতে পারবে।
> 2. Claude-কে বলুন, যাচাই না হওয়া লেআউট বাদ দিয়ে build করে দেবে। আপনার নিজের `.avrolayout` ফাইল অ্যাপে আগের মতো যোগ করা যাবে।

---

## কোন পথে

| | **ক. Cloudflare Pages (সুপারিশ)** | খ. আপনার ওয়েবসাইটের GitHub Pages-এ |
|---|---|---|
| ঠিকানা | `https://pronotes.mahbuburrahman.bd` | `https://www.mahbuburrahman.bd/pronotes/` |
| খরচ | ফ্রি | ফ্রি |
| নতুন account | Cloudflare (ফ্রি) | লাগে না |
| Private repo থেকে | চলে | চলে না। GitHub-এর ফ্রি প্ল্যানে Pages শুধু public repo থেকে চলে, তাই হাতে build করে ওয়েবসাইটের repo-তে কপি করতে হয় |
| আপডেট | `git push` করলেই নিজে থেকে | প্রতিবার build → কপি → ওয়েবসাইটের repo-তে push |
| নিরাপত্তা header (`public/_headers`) | কাজ করে | কাজ করে না (GitHub Pages header বদলাতে দেয় না) |
| ওয়েবসাইটের ওপর প্রভাব | নেই; শুধু একটা DNS record যোগ | ওয়েবসাইটের repo-তে ProNotes-এর build ফাইল ঢোকে |

**আমার মত:** পথ ক। কারণ repo private থাকে, আপডেট নিজে থেকে হয়, নিরাপত্তা header কাজ করে, আর আপনার Astro সাইটের repo পরিষ্কার থাকে।

> **একবার ঠিকানা বেছে নিলে আর বদলাবেন না।**
> ব্রাউজার প্রতিটা ঠিকানার (domain) লেখা আলাদা জায়গায় রাখে। ঠিকানা বদলালে আগের ঠিকানার ড্রাফট নতুনটায় দেখা যাবে না।
> সরাতে হলে পুরোনো জায়গা থেকে **Settings → ব্যাকআপ** নিয়ে নতুনটায় ফেরত আনতে হবে।
> claude.ai-এর প্রিভিউতে লেখা কিছু থাকলে সেটাও এভাবেই আনতে হবে।

---

## পথ ক: Cloudflare Pages

### ১. Cloudflare-এ project

1. https://dash.cloudflare.com/sign-up — ফ্রি account খুলুন। (account খোলা আপনার নিজের কাজ; Claude খুলবে না।)
2. বাম মেনু **Workers & Pages → Create → Pages → Connect to Git**।
3. **GitHub** বাছুন। অনুমতি দেওয়ার সময় **"Only select repositories" → `pronotes`** দিন, সব repo নয়।
4. Repo `pronotes` → **Begin setup**, তারপর ঘরগুলো এভাবে পূরণ করুন:

| ঘর | মান |
|---|---|
| Project name | `pronotes` |
| Production branch | `main` |
| Framework preset | `None` (বা `Vite`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `NODE_VERSION` = `22` |

5. **Save and Deploy** চাপুন। ২–৩ মিনিটে `https://pronotes.pages.dev` (বা এর মতো একটা ঠিকানা) চালু হবে।
6. সেই ঠিকানা খুলে দেখুন অ্যাপ চলছে কি না। নিচের "বসানোর পর পরীক্ষা" অংশ মিলিয়ে নিন।

### ২. নিজের ঠিকানা: `pronotes.mahbuburrahman.bd`

1. Cloudflare-এ project → **Custom domains → Set up a custom domain** → `pronotes.mahbuburrahman.bd` লিখুন।
2. Cloudflare একটা **CNAME** record দেখাবে।
3. `mahbuburrahman.bd`-এর DNS যেখানে চালান (ডোমেইন যেখান থেকে কিনেছেন তাদের প্যানেল, বা অন্য DNS সেবা), সেখানে এই record যোগ করুন:

| Type | Name / Host | Value / Target | TTL |
|---|---|---|---|
| CNAME | `pronotes` | `pronotes.pages.dev` (Cloudflare যা দেখায়) | Auto / 3600 |

   - এতে আপনার মূল সাইট (`www` আর `@` record, যা GitHub Pages-এ যায়) একটুও বদলায় না। শুধু নতুন একটা নাম যোগ হয়।
   - ⚠️ DNS-এ বদল আপনি নিজে করবেন; Claude DNS-এ হাত দেবে না।
4. কয়েক মিনিট থেকে কয়েক ঘণ্টায় Cloudflare-এ **Active** দেখাবে, https সার্টিফিকেট নিজে থেকে আসবে।

### ৩. আপডেট

`git push` করলে Cloudflare নিজে থেকে নতুন build করে বসায়। iPad-এ খোলা অ্যাপের নিচে "নতুন ভার্সন আছে" বার্তা আসে। "এখন আপডেট করুন" চাপলে খোলা ড্রাফট সেভ করে তারপর নতুন ভার্সনে যায়।

ভুল ভার্সন চলে গেলে: Cloudflare → project → **Deployments** → আগের সফল deployment → **Rollback**।

---

## পথ খ: ওয়েবসাইটের GitHub Pages-এ (`/pronotes/`)

ProNotes `base: './'` দিয়ে build হয়, তাই উপ-ফোল্ডার থেকেও চলে।

1. ProNotes ফোল্ডারে:

   ```bash
   npm ci
   npm run build
   ```

2. তৈরি হওয়া `dist/`-এর **ভেতরের সব কিছু** ওয়েবসাইটের repo-র `public/pronotes/` ফোল্ডারে কপি করুন। আগের ফাইল থাকলে আগে সেগুলো মুছে দিন, যাতে পুরোনো ফাইল না থেকে যায়।
3. ওয়েবসাইটের repo-তে:

   ```bash
   git add public/pronotes
   git commit -m "ProNotes আপডেট"
   git push
   ```

4. GitHub Pages-এ সাইট নতুন হলে খুলুন: `https://www.mahbuburrahman.bd/pronotes/`

সীমা:

- ওয়েবসাইটের repo public, তাই ProNotes-এর build করা ফাইলও সেখানে সবার দেখার মতো থাকবে।
- `_headers` কাজ করবে না।
- প্রতিটা আপডেট হাতে করতে হবে।

---

## বসানোর পর পরীক্ষা (দুই পথেই)

- [ ] ঠিকানা `https://` দিয়ে খোলে, তালার চিহ্ন আছে
- [ ] Settings → **অ্যাপ: অফলাইন ও ইনস্টল**-এ "অফলাইন: চালু" দেখায়
- [ ] iPad Safari → Share → **Add to Home Screen** → হোম স্ক্রিন থেকে পুরো পর্দায় খোলে
- [ ] Airplane mode-এ অ্যাপ খোলে, লেখা সেভ হয়
- [ ] Word (.docx) সেভ হয়, Files-এ যায়
- [ ] (Gemini key দিলে) AI → Gemini উত্তর দেয়। claude.ai প্রিভিউতে এটা চলত না, সাইটে চলা উচিত।
- [ ] তারপর `docs/ipad-checklist.md`-এর পুরো তালিকা

## যা সাইটে যায়, যা যায় না

| যায় | যায় না |
|---|---|
| অ্যাপের কোড, অ্যাপের ফন্ট (Noto/Hind Siliguri, OFL), আইকন, কিবোর্ড লেআউট | কোনো ড্রাফট, শব্দভান্ডার, ব্যাকআপ, Gemini key, নিজের যোগ করা ফন্ট (সব ডিভাইসেই থাকে) |
| `_headers` (নিরাপত্তা ও cache নিয়ম) | analytics বা ট্র্যাকিং (নেই) |

`public/_headers`-এর Content-Security-Policy অ্যাপকে শুধু নিজের সাইট আর Google-এর Gemini ঠিকানার সাথে যোগাযোগ করতে দেয়। এই header দিয়ে সব browser test (৭৭টা) চালিয়ে দেখা হয়েছে।
