# ProNotes সাইটে বসানো: GitHub Pages, `pronotes.mahbuburrahman.bd`

মালিকের সিদ্ধান্ত (decision 46):

- আলাদা **public** repo (`advocate-mahbub/pronotes`), তার নিজের GitHub Pages
- ঠিকানা: `https://pronotes.mahbuburrahman.bd`
- লাইসেন্স: সর্বস্বত্ব সংরক্ষিত (`LICENSE`)। কোড সবাই দেখতে পাবে, কিন্তু অনুমতি ছাড়া কপি, বদল বা অন্য কোথাও চালানো যাবে না।

ProNotes একটা স্থির (static) PWA। সার্ভার বা ডেটাবেস লাগে না; সব লেখা ব্যবহারকারীর নিজের ডিভাইসে থাকে। GitHub নিজেই build করে `dist/` সাইটে বসায় (`.github/workflows/deploy.yml`)।

> ⚠️ **Public করার আগে একটা কথা।** repo বা সাইট public হলে ভেতরের কিবোর্ড লেআউটও (Bornona, National, Probhat, Munir Optima, Avro Easy) সবার কাছে চলে যায়। এগুলো বিলি করার অনুমতি এখনো যাচাই হয়নি (`LICENSES/THIRD_PARTY.md`)।
> আপনার "সর্বস্বত্ব সংরক্ষিত" লাইসেন্স শুধু আপনার নিজের কোডে খাটে, এই লেআউটগুলোতে নয়। সিদ্ধান্ত আপনার। সম্ভাব্য পথ:
> 1. নির্মাতাদের কাছে লিখিত অনুমতি চাওয়া।
> 2. যাচাই না হওয়া লেআউট বাদ দিয়ে প্রকাশ। ব্যবহারকারী নিজের `.avrolayout` ফাইল যোগ করে নেবেন। বললে Claude এই সংস্করণ করে দেবে।
> 3. জেনে-বুঝে এখনই প্রকাশ, পরে অনুমতি নেওয়া।

---

## ধাপ ১. repo বানানো ও কোড তোলা

`docs/GITHUB.md` অনুযায়ী করুন, শুধু repo বানানোর সময় **Public** বাছবেন। আগেই Private বানিয়ে থাকলে:

**Settings → General → (একদম নিচে) Danger Zone → Change repository visibility → Make public**

## ধাপ ২. GitHub Pages চালু

1. repo → **Settings → Pages**
2. **Build and deployment → Source: GitHub Actions** বেছে নিন।
   "Deploy from a branch" নয়; আমাদের `deploy.yml` নিজেই build করে।
3. **Actions** ট্যাবে দেখুন "Deploy to GitHub Pages" চলছে।
   - ৩–৫ মিনিটে সবুজ ✓ হলে `https://advocate-mahbub.github.io/pronotes/` ঠিকানায় অ্যাপ খোলে।
   - প্রথমবার লাল ✗ হলে workflow-টা আবার চালান: Actions → Deploy → **Re-run jobs**। ধাপ ২-এর Source ঠিক না থাকলে প্রথম চালানো ব্যর্থ হতে পারে।

## ধাপ ৩. নিজের ঠিকানা `pronotes.mahbuburrahman.bd`

**ক. DNS-এ একটা record যোগ** (যেখানে `mahbuburrahman.bd`-এর DNS চালান, যেমন ডোমেইনের প্যানেল):

| Type | Name / Host | Value / Target | TTL |
|---|---|---|---|
| CNAME | `pronotes` | `advocate-mahbub.github.io` | Auto / 3600 |

- Value-তে শুধু `advocate-mahbub.github.io` লিখবেন, শেষে `/pronotes` নয়।
- আপনার মূল সাইটের `www` আর `@` record যেমন আছে তেমন থাকবে; শুধু নতুন একটা নাম যোগ হচ্ছে।
- DNS-এ বদল আপনি নিজে করবেন।

**খ. GitHub-এ ঠিকানা বসানো**

1. repo → **Settings → Pages → Custom domain** → `pronotes.mahbuburrahman.bd` → **Save**
2. "DNS check successful" এলে **Enforce HTTPS** টিক দিন। সার্টিফিকেট আসতে কয়েক মিনিট থেকে কয়েক ঘণ্টা লাগতে পারে; ততক্ষণ টিক বক্স ধূসর থাকতে পারে।

**গ. (সুপারিশ) ডোমেইন যাচাই**

GitHub-এর account বা organization → **Settings → Pages → Add a domain** → `mahbuburrahman.bd`। GitHub একটা TXT record দেবে, সেটা DNS-এ যোগ করে **Verify** চাপুন।

এতে অন্য কেউ আপনার ডোমেইনের নামে GitHub Pages বসাতে পারবে না। আপনার মূল সাইটের জন্য এটা আগে করা থাকলে আর লাগবে না।

> **ঠিকানা একবারই ঠিক করুন।** ব্রাউজার প্রতিটা ঠিকানার লেখা আলাদা জায়গায় রাখে। `advocate-mahbub.github.io/pronotes/`-এ লেখা ড্রাফট `pronotes.mahbuburrahman.bd`-এ দেখা যাবে না। তাই নিজের ঠিকানা চালু হওয়ার পর থেকেই ব্যবহার শুরু করুন।
> claude.ai-এর প্রিভিউতে কিছু লিখে থাকলে সেখান থেকে **Settings → ব্যাকআপ** নিন, তারপর নতুন সাইটে **ব্যাকআপ → ফেরত আনুন**।

## ধাপ ৪. ওয়েবসাইটে লিংক দেওয়া

আপনার Astro সাইট (`advocate-mahbub-website`) আলাদা repo; সেখানে শুধু লিংক দিতে হবে:

| কোথায় | কী দেবেন |
|---|---|
| Tools পাতা (বা যেখানে ProNotes-এর পরিচয় দেবেন) | `ProNotes খুলুন` → `https://pronotes.mahbuburrahman.bd` |
| সাইটের footer | `ProNotes লাইসেন্স` → `https://pronotes.mahbuburrahman.bd/license.html` |

লাইসেন্সের পাতা (`license.html`) ProNotes-এর সাথেই প্রকাশ হয়: বাংলা পাঠ, আর নিচে ইংরেজি (বাধ্যতামূলক) পাঠ। অ্যাপের ভেতরে **Settings → অ্যাপ: অফলাইন ও ইনস্টল**-এও এর লিংক আছে।

## ধাপ ৫. আপডেট

`git push` করলেই কাজ শুরু হয়:

1. GitHub টাইপ পরীক্ষা, unit test আর build চালায়।
2. সব পাস করলে নতুন ভার্সন সাইটে বসে। কোনো test ভাঙলে বসে না; পুরোনো ভার্সন চলতে থাকে।
3. খোলা অ্যাপে "নতুন ভার্সন আছে" বার্তা আসে। "এখন আপডেট করুন" চাপলে খোলা ড্রাফট সেভ করে তবেই নতুন ভার্সনে যায়।

ভুল ভার্সন চলে গেলে আগের commit ফিরিয়ে push করুন:

```bash
git revert HEAD
git push
```

## বসানোর পর পরীক্ষা

- [ ] `https://pronotes.mahbuburrahman.bd` খোলে, তালার চিহ্ন আছে
- [ ] Settings → **অ্যাপ: অফলাইন ও ইনস্টল**-এ "অফলাইন: চালু"
- [ ] iPad Safari → Share → **Add to Home Screen** → হোম স্ক্রিন থেকে পুরো পর্দায় খোলে
- [ ] Airplane mode-এ অ্যাপ খোলে, লেখা সেভ হয়
- [ ] Word (.docx) সেভ হয়, Files-এ যায়
- [ ] লাইসেন্সের লিংক খোলে
- [ ] (Gemini key দিলে) AI → Gemini উত্তর দেয়
- [ ] তারপর `docs/ipad-checklist.md`-এর পুরো তালিকা

## GitHub Pages-এর সীমা (জেনে রাখুন)

- GitHub Pages নিজের মতো header পাঠাতে দেয় না। তাই নিরাপত্তার নিয়ম (CSP) `index.html`-এর ভেতরে `<meta>` হিসেবে দেওয়া আছে: অ্যাপ শুধু নিজের সাইট আর Google Gemini-র ঠিকানায় যোগাযোগ করতে পারে। এই নিয়ম চালু রেখে সব browser test (৭৮টা) পাস করেছে।
- `public/_headers` GitHub Pages-এ কাজ করে না। পরে কখনো Cloudflare Pages বা Netlify-তে নিলে কাজে লাগবে।
- GitHub Pages ফাইল ১০ মিনিট cache করে। তাই push-এর পর নতুন ভার্সন দেখাতে ১০ মিনিট পর্যন্ত লাগতে পারে।

## বিকল্প (দরকার হলে): Cloudflare Pages

repo আবার private করতে চাইলে Cloudflare Pages ফ্রিতে private repo থেকেও চলে।

**সেটিং:**
- Build command: `npm run build`
- Output: `dist`
- `NODE_VERSION=22`
- `_headers` সেখানে কাজ করে।

**কীভাবে:**
1. Cloudflare-এ project বানিয়ে GitHub repo জুড়ুন।
2. DNS-এর CNAME `pronotes` → Cloudflare যে ঠিকানা দেয় (যেমন `pronotes.pages.dev`) সেখানে বদলান।
3. GitHub-এ Pages বন্ধ করুন।
4. `.github/workflows/deploy.yml` মুছে দিন বা নিষ্ক্রিয় করুন।
