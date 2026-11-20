# ▦ → আমার অ্যাপ (নিজের ওয়েব অ্যাপ)

ProNotes-এর ▦ চাপলে "আমার অ্যাপ"। সেখানে যেকোনো ওয়েব অ্যাপের **.zip** যোগ করা যায় (ভেতরে একটা `index.html` থাকতে হবে)।
অ্যাপ এই ডিভাইসেই থাকে, ইন্টারনেট ছাড়াও চলে। অ্যাপের লেখার ঘরে ProNotes-এর কিবোর্ড লেআউটে বাংলা লেখা যায়।

## কেন আলাদা ঠিকানা (apps.mahbuburrahman.bd)
বাইরের অ্যাপ ProNotes-এর ঠিকানায় চললে সে ProNotes-এর ড্রাফট, সেটিং, Gemini key সব পড়তে পারত। আলাদা ঠিকানায় চলায় ব্রাউজার নিজেই
সেটা আটকায়। দুটো ঠিকানা একই ডোমেইনের (mahbuburrahman.bd), তাই iPad Safari-তেও অ্যাপের জায়গা ঠিক থাকে।
ProNotes-এর নিজের Craft অ্যাপগুলো (ArtCraft-এর অফিসিয়াল build) আগের মতোই ProNotes-এর ঠিকানায় চলে।

## একবারের সেটআপ (বিনা খরচে)
1. GitHub-এ নতুন **public** repository: `advocate-mahbub/pronotes-apps` (README দিয়ে বানালেই হবে)।
2. সেখানে ফাইল যোগ করুন: `.github/workflows/deploy-apps.yml` — লেখাটা এই repo-র `docs/apps-site/deploy-apps.yml` থেকে হুবহু কপি।
   কোনো token বা secret লাগে না: workflow এই public repo থেকে কোড পড়ে build করে।
3. `pronotes-apps` → Settings → Pages → Source: **GitHub Actions**।
4. Actions → "Deploy apps site" → **Run workflow**। সবুজ ✓ হলে সাইট তৈরি।
5. BTCL DNS প্যানেলে (bdia.btcl.com.bd) একটা রেকর্ড: **CNAME** · নাম `apps` · মান `advocate-mahbub.github.io`
6. `pronotes-apps` → Settings → Pages → Custom domain: `apps.mahbuburrahman.bd` → Save; DNS ধরলে "Enforce HTTPS" চালু করুন।

এরপর প্রতিদিন নিজে থেকে নতুন build হয়; তাড়া থাকলে Run workflow।

## কোন অ্যাপ চলে
- **চলে:** HTML/JavaScript/CSS/WebAssembly দিয়ে বানানো static ওয়েব অ্যাপ — ক্যালকুলেটর, নোট, হিসাব, ফর্ম, গেম, PWA-র build ফোল্ডার, React/Vue/Svelte-এর `dist` ফোল্ডার zip করে। বাইরের API-তে যায় এমন অ্যাপও চলে, যদি সেই API ব্রাউজার থেকে ডাকতে দেয়।
- **চলে না:** যে অ্যাপের নিজের সার্ভার লাগে (PHP, Node সার্ভার, ডেটাবেস)।
- **WhatsApp, Gmail, Facebook:** এগুলো zip অ্যাপ নয়, ওদের সার্ভারে চলে। আর ওরা অন্য সাইটের ফ্রেমের ভেতরে খুলতে দেয় না, তাই ProNotes-এর ভেতরে বসানো যায় না। WhatsApp-এ ProNotes-এর লেখা পাঠাতে: ড্রাফটে লিখে শেয়ার (⤴) → WhatsApp।
- সীমা: খোলার পর ৩০০ MB, ৫০০০ ফাইল; পাসওয়ার্ড দেওয়া zip আর ZIP64 নয়।

## কিবোর্ড
- ফিজিক্যাল কিবোর্ড আর iPad/ফোনের নিজের কিবোর্ড: ProNotes-এর লেআউট (Bornona, ProNotes, Avro Easy, নিজের যোগ করা লেআউট), স্বর-গঠন, হসন্তের নিয়ম — ProNotes-এর মতোই। Ctrl+Space (বা Settings-এর key) চাপলে ProNotes-এর ভাষাও বদলায়।
- `<input>`, `<textarea>` আর contenteditable এডিটরে কাজ করে। canvas-এ আঁকা এডিটরে (যেমন Craft অ্যাপের ভেতরের লেখা) নয়।
- এখনো নয়: ProNotes-এর নিজের অন-স্ক্রিন কিবোর্ড অ্যাপের ভেতরে, Keyman rules কিবোর্ড আর Phonetic।

## নিরাপত্তা
- অ্যাপগুলো একে অন্যের জিনিস দেখতে পারে (সবাই apps-ঠিকানায়), কিন্তু ProNotes-এর কিছুই দেখতে পারে না।
- ProNotes অ্যাপগুলোকে শুধু কিবোর্ড লেআউট আর টাইপিং সেটিং পাঠায়; আর কিছু নয়। ProNotes শুধু apps.mahbuburrahman.bd থেকে আসা বার্তা শোনে, আর apps-সাইট শুধু ProNotes-এর ঠিকানা থেকে আসা বার্তা।
- অচেনা উৎসের zip যোগ করবেন না — অ্যাপ ইন্টারনেটে যেকোনো জায়গায় যেতে পারে।

## কম্পিউটারে পরীক্ষা
```
npm run build:apps && npm run preview:apps   # http://localhost:4174
npm run dev                                  # ProNotes; localhost-এ চললে সে localhost:4174-কে apps-সাইট ধরে
```
