# ১৬ নভেম্বর ২০২৬: ১৩ নভেম্বরের commit-এ হারানো কাজ ফেরত

## কী হয়েছিল
`df4290d` ("Improve mobile keyboard UI and editor shortcuts", ১৩ নভেম্বর) একটা পুরোনো কপির ওপর বানানো হয়েছিল। তাই এর message-এ যা লেখা নেই, এমন অনেক কাজ চুপচাপ মুছে গিয়েছিল। তারপর থেকে CI লাল।

মুছে যাওয়া যা ফেরত আনা হলো (`152cf8e` অনুযায়ী):
- Word-এর মতো ভাগ করা ribbon (গ্রুপ), Liquid Glass চেহারা, Tools-এ ⚖ আইনি অভিধান বোতাম (`ba651da`)
- লেআউট ফাইল যোগ: OpenBangla .json, Keyman .kmx/.kmp, Keyman রুল দিয়ে টাইপ (decision 60) — শুধু Avro রয়ে গিয়েছিল
- লেআউট লুকানোর তালিকা (hiddenLayouts), reload-এর পরেও নিজের যোগ করা লেআউট বাছাই থাকা (`c7e8be0`)
- production build-এ CSP `<meta>` (charset "UTF-8" হওয়ায় বসছিল না) — না বসলে build এখন থেমে যায়
- `index.html`-এর `robots noindex`, description, status-bar meta
- glass toolbar-এর popover/dialog `<body>`-এ (কেটে না যাওয়ার জন্য)
- `LICENSES/THIRD_PARTY.md`-এর Keyman পরীক্ষা-ফাইলের লাইসেন্স (MIT), decisions.md-এর decision 60
- FontPicker-এর বাংলা লেখায় য় আবার এক অক্ষরে (U+09DF), Backspace-এ emoji-র দুই অংশ একসাথে মোছা
- deploy-এর আগে browser test (CSP, offline, home-screen ঠিক আছে কি না)

রাখা হলো (`df4290d`-এর আসল উদ্দেশ্য): ৪টা অনুমোদিত লেআউট (ProNotes, ProNotes Phonetic, Bijoy Classic, UniBijoy), Phonetic টাইপ, পরামর্শ না থাকলে পরামর্শের সারি লুকানো, ছোট কিবোর্ড ফাঁক, SutonnyOMJ কী-লেবেল।

## পরীক্ষার বদল
- v8-এর পুরোনো লেআউটের (National, Probhat, Munir, Avro Easy) golden e2e বাদ (skip): এগুলো আর অ্যাপে নেই। Bornona-র পরীক্ষা চলে।
- ব্র্যান্ড লোগো, লেআউট তালিকা (Probhat → UniBijoy), পরামর্শ-সারি লুকানো নিয়মের সাথে পরীক্ষা মিলানো; একটা flaky পরীক্ষা শক্ত করা; CI-তে একবার retry।
