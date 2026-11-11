# Ribbon পরিকল্পনা: "MS Word for iPad UI/UX Audit"-এর সংশোধিত রূপ

তারিখ: ২০২৬-১১-১১। ভিত্তি: `main` (commit `c45295b`)-এর কোড, বিশেষ করে `src/app/Ribbon.tsx`, `src/app/TableRibbon.tsx`, `src/editor/createEditor.ts`।

মূল audit-টা স্ক্রিনশট দেখে লেখা, কোড দেখে নয়। তাই তাতে কয়েকটা জিনিস "দরকার" বলা হয়েছে যা অ্যাপে আগে থেকেই আছে, আর কয়েকটা জিনিস "সরিয়ে আনা" বলা হয়েছে যা আসলে নতুন বড় ফিচার। এই নথি সেগুলো ঠিক করে, তারপর কাজের ধাপ দেয়।

যা যাচাই করা যায়নি: Word-এর স্ক্রিনশটগুলো এই পর্যালোচনায় দেখা হয়নি, আর মূল audit-এর "Microsoft Support" সূত্রগুলোর কোনো লিংক নেই। Word সম্পর্কে তথ্যগুলো তাই অযাচাই করা হিসেবে ধরা হয়েছে।

## ১. মূল audit-এর ভুল ও সংশোধন

| # | মূল audit যা বলেছে | কোডে যা আছে | সংশোধন |
|---|---|---|---|
| 1 | Main tab তিনটা: Home, Insert, Tools | "নোট" ডকুমেন্টে তিনটা। "আইনি" ডকুমেন্টে পাঁচটা: হোম, ঢোকান, পাতা, View, টুলস (`Ribbon.tsx:491`) | স্ক্রিনশট সম্ভবত নোট-ধরনের ডকুমেন্টের। আইনি ডকুমেন্টে Layout আর View আগে থেকেই আছে। |
| 2 | Table-এর জন্য contextual tab বানাতে হবে | আছে। টেবিলে cursor থাকলে "টেবিল ডিজাইন" ও "টেবিল লেআউট" আসে (`Ribbon.tsx:493`): সারি/কলাম যোগ-মোছা, ঘর জোড়া/ভাগ, দাগ, রং, ৬টা স্টাইল, সাজানো, যোগফল, লেখা ⇄ টেবিল, হেডার প্রতি পাতায় | নতুন করে বানানোর কিছু নেই। শুধু সাজানো। |
| 3 | Layout tab দরকার (Margins, Orientation, Paper size) | "পাতা" tab-এ আছে: কাগজের মাপ, খাড়া/আড়াআড়ি, লেখার দিক, মার্জিন, পাতা নম্বর, ডকুমেন্টের ভাষা, পাতা সেটআপ | নেই শুধু Columns, Page border, Section break। |
| 4 | View tab দরকার (Print layout, Ruler, Zoom, Page width, One page) | আছে: পাতা আলাদা/একটানা, Ruler ও একক, Gridlines ও অপশন, Zoom (৫০–২০০%, পাতার চওড়া, পুরো পাতা) | নেই শুধু Headings navigation আর Full screen। |
| 5 | শেষে "More" menu দরকার | হোম-এ "⋯ আরও" আছে | অন্য tab-এ দরকার হলে একই Popover ব্যবহার। |
| 6 | Font dropdown-এ search, font size editable + বাড়ানো/কমানো | দুটোই আছে (`FontPicker.tsx`, `size`, `grow`, `shrink`) | কিছু করার নেই। |
| 7 | Touch target ছোট | `.tb` বোতাম ৪৪×৪৪ px, Apple-এর ন্যূনতম মাপ | সমস্যা মাপে নয়; ঘনত্বে আর কাটা label-এ। |
| 8 | External keyboard shortcut দরকার | আছে: Ctrl/⌘+B, I, U, Z, Y, F, H, Enter | তালিকাটা Settings-এ দেখানো যেতে পারে। |
| 9 | Tools-এ Hissa Calculator, Chain of Ownership, Legal Templates "থাকবে" | ProNotes-এ এগুলো নেই। আছে শুধু খাম (template) আর ৬টা Quick Table | এগুলো নতুন ফিচার, স্থানান্তর নয়। আলাদা সিদ্ধান্ত লাগবে। |
| 10 | Insert-এ Picture, Camera, Shape, Link, Equation, Text box, Header/Footer | কোনোটাই নেই। Link ইচ্ছা করে বন্ধ (`createEditor.ts:27`) | প্রতিটার জন্য editor node + pagination + ৭টা export (docx, .doc, ANSI, txt, md, html, png/PDF) লাগবে। toolbar-এর কাজ নয়। |
| 11 | Review tab: Spelling, Comments, Track Changes, Compare | আছে শুধু খুঁজুন ও বদলান আর শব্দ গণনা। বানান-পরীক্ষা ইচ্ছা করে পেছানো (decision 56: শব্দ-তালিকায় ভুল বানান) | দুই বোতামের জন্য tab নয়। এখন Review tab হবে না। |
| 12 | References tab: TOC, Footnote, Citation, Bibliography, Index | কিছুই নেই | এখন tab হবে না। আরজি, জবাব, দলিলে এগুলোর চাহিদা কম (মতামত; মালিক ঠিক করবেন)। |
| 13 | Text select করলে floating toolbar | নেই | iPadOS নিজেই select-এর ওপর Copy/Paste বার দেখায়; আরেকটা বার তার সাথে ঠোকাঠুকি করবে। সুপারিশ: না। |
| 14 | Quick Table পাঁচ category-তে | ৬টা টেবিল, এক তালিকায় | ৬টার জন্য category মানে বাড়তি এক tap। ১০টার বেশি হলে তখন ভাগ। |

মূল audit-এর যা ঠিক: toolbar ঘন, কিছু label কাটা পড়ে, কোনো ফিচার বাদ দেওয়া যাবে না, আগে mapping তারপর refactor, আর Track Changes/Footnote-এর মতো জিনিস শুধু বোতাম বসালে চলবে না।

## ২. সিদ্ধান্ত: সাত tab নয়

মূল প্রস্তাব: Home, Insert, Layout, Review, View, References, Tools (৭) + contextual। এতে Review আর References প্রায় ফাঁকা থাকবে, আর iPad portrait-এ (৭৬৮–৮৩৪ px) tab-সারিই জায়গা খেয়ে ফেলবে।

রাখা হবে:

- আইনি ডকুমেন্ট: হোম · ঢোকান · পাতা · View · টুলস (+ টেবিলে থাকলে টেবিল ডিজাইন · টেবিল লেআউট)
- নোট: হোম · ঢোকান · টুলস (+ টেবিল tab)

Review বা References tab তখনই আসবে, যখন তার অন্তত তিন-চারটা আসল ফিচার তৈরি হবে।

## ৩. এখনকার প্রতিটি control কোথায় থাকবে

`data-testid` বদলাবে না। test-গুলো এগুলো ধরেই চলে।

### হোম

| দল | control (testid) | সিদ্ধান্ত |
|---|---|---|
| ফন্ট | ফন্ট বাছাই, `size`, `grow`, `shrink`, `bold`, `italic`, `underline`, রং, highlight | থাকবে, সামনে |
| ফন্ট (আরও) | `strike`, `superscript`, `subscript`, `case`, `clear-format`, `font-panel` | "⋯ আরও"-তে |
| অনুচ্ছেদ | `pstyle`, `align`, `line`, `outdent`, `indent`, `numbered` (আইনি) বা `bullets`/`ordered`/`tasks` (নোট) | থাকবে, সামনে |
| অনুচ্ছেদ (আরও) | `sp-before`, `sp-after`, `marks`, `para-panel` | "⋯ আরও"-তে |
| সম্পাদনা | `painter`, `select-all` | থাকবে |
| খোঁজা | `find-open`, `replace-open` | হোম থেকে "⋯ আরও"-তে; মূল জায়গা টুলস (`tools-find`)। একই কাজ দুই জায়গায় সামনে থাকবে না। |

### ঢোকান

| control (testid) | সিদ্ধান্ত |
|---|---|
| `table-add` (তফসিল), টেবিল menu (মাপ বেছে, Quick Table ৬টা, লেখা থেকে টেবিল) | থাকবে |
| `page-break`, `symbols`, `date` | থাকবে |

### পাতা (আইনি)

`paper`, `portrait`, `landscape`, `text-dir`, `margins`, `pn-off`, `pn-style`, `doc-lang`, `page-setup`: সব থাকবে। দল: কাগজ · মার্জিন · পাতা নম্বর · ভাষা।

### View (আইনি)

`layout-print`, `layout-web`, `page-count`, `ruler-toggle`, `ruler-unit`, `grid-toggle`, `grid-opts`, `zoom`, `zoom-out`, `zoom-in`, `zoom-100`: সব থাকবে। দল: দেখার ধরন · সহায়ক রেখা · Zoom।

### টুলস

| control (testid) | সিদ্ধান্ত |
|---|---|
| `tools-find`, `bijoy-toggle`, `ai`, `word-count` | থাকবে |
| Law Dictionary (এখন ওপরের বারে) | টুলসেও একটা বোতাম; ওপরের বারেরটা থাকবে |

### সব tab-এ

`undo`, `redo`, `ribbon-collapse`, শেয়ার: যেমন আছে।

### টেবিল ডিজাইন · টেবিল লেআউট

`TableRibbon.tsx`-এর সব control থাকবে। শুধু দলের নাম দেখানো হবে (স্টাইল · দাগ · রং / সারি ও কলাম · ঘর · মাপ · তথ্য)।

## ৪. কাজের ধাপ

### ধাপ ক: শুধু UI (editor engine ছোঁয়া হবে না)

1. প্রতিটা tab-এ control-গুলো নাম দেওয়া দলে, দলের মাঝে দাগ।
2. কাটা label ঠিক: ফন্টের নাম ও স্টাইল বাক্সে `text-overflow: ellipsis` আর পুরো নাম `title`-এ; "অনুচ্ছেদ" বোতাম icon + tooltip।
3. সরু পর্দায় (≤ ৮৩৪ px, iPad portrait) প্রতিটা দলের কম-ব্যবহৃত control সেই দলের "⋯"-তে; সারি এক লাইনে থাকবে, পাশে scroll নয়।
4. খোঁজা/বদলানোর দ্বৈততা সরানো (ওপরের ছক)।
5. টুলসে Law Dictionary বোতাম।
6. নতুন test: এই নথির সব `data-testid` আইনি ও নোট ডকুমেন্টে খুঁজে পাওয়া যায় (সামনে বা "⋯"-এর ভেতরে)। এটাই "কোনো ফিচার হারায়নি"-র প্রমাণ।

### ধাপ খ: ছোট নতুন ফিচার (engine-এ সামান্য)

- Headings navigation: শিরোনামের তালিকা থেকে লাফ (Heading আগে থেকেই আছে)।
- নোট ডকুমেন্টেও Zoom।
- Quick Table বাড়লে category।

### ধাপ গ: বড় ফিচার (document model + pagination + সব export)

একটা একটা করে, প্রতিটার আগে আলাদা সিদ্ধান্ত: Header/Footer লেখা → Footnote → ছবি → Link।
প্রতিটার জন্য লাগবে: Tiptap node, পাতা-ভাঙার হিসাব, docx/.doc/ANSI/txt/md/html/png export, test।

### এখন পরিকল্পনায় নেই

Track Changes, Compare, Comments, Citation/Bibliography/Index, Shape, Equation, Text box, Columns, floating selection toolbar।

## ৫. অবস্থা (২০২৬-১১-১১)

ধাপ ক করা হয়েছে, সঙ্গে iPadOS/iOS ধাঁচের Liquid Glass:

- প্রতিটা tab নামসহ দলে (`group()` in `Ribbon.tsx`); দলের নাম শুধু চওড়া ribbon-এ দেখায়।
- রং ও highlight সামনে; খোঁজা/বদলানো হোম-এ শুধু "⋯"-তে, মূল জায়গা টুলস।
- কোন tool "⋯"-তে যাবে তা ঠিক হয় ribbon-এর মাপ দেখে (`NARROW_RIBBON` = ১০৮০ px)। সামনের কপিগুলো পাতায় থাকে, সরু হলে শুধু লুকায়।
- টুলসে আইনি অভিধানের বোতাম (`tools-dictionary`)।
- Glass: ribbon, sidebar, popover, dialog, findbar, converter/AI panel। পাতা, কিবোর্ড ও লেখা কঠিন রঙে। Blur না থাকলে, Reduce Transparency, Increase Contrast ও print-এ কঠিন রঙ।
- `backdrop-filter` থাকা element তার ভেতরের `position: fixed` জিনিসের ফ্রেম হয়ে যায়। তাই Popover, Sheet আর AI-র নিশ্চিত-করার dialog এখন `<body>`-তে (portal)। এতে ⋯ মেনুর ভেতরের বোতাম আর সারির ভেতরে থাকে না; `documents.spec.ts` সেভাবে হালনাগাদ।
- প্রমাণ: `tests/e2e/ribbon-groups.spec.ts` (iPad landscape ও portrait-এ পরিকল্পনার সব `data-testid` পাওয়া যায়)।

যাচাই বাকি: আসল iPad Safari (WebKit এই পরিবেশে চালানো যায়নি); Safari `prefers-reduced-transparency` মানে কি না।
