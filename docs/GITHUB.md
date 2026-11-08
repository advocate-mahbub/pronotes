# GitHub-এ নতুন repo করে ProNotes তোলা

এই ফাইলে তিনটা কাজ ধাপে ধাপে আছে:

- GitHub-এ repo বানানো (মালিকের সিদ্ধান্ত: **Public**, GitHub Pages-এ বসানোর জন্য; decision 46)
- কাজের পুরো ইতিহাস (সব commit) সহ কোড সেখানে তোলা
- পরে নতুন বদল কীভাবে পাঠাবেন

> **Public করার আগে** `docs/DEPLOY.md`-এর শুরুর সতর্কতাটা পড়ুন। কিবোর্ড লেআউটগুলো (Bornona, National, Probhat, Munir Optima, Avro Easy) আবার বিলি করার অনুমতি এখনো যাচাই হয়নি (`LICENSES/THIRD_PARTY.md`)।
> আপনার নিজের কোড `LICENSE` (সর্বস্বত্ব সংরক্ষিত) দিয়ে সুরক্ষিত।
> SutonnyMJ/SutonnyOMJ ফন্ট ফাইল কখনো repo-তে রাখবেন না।

---

## ০. যা লাগবে (একবারই)

| জিনিস | কোথায় |
|---|---|
| GitHub account | আপনার আছে (`advocate-mahbub`) |
| Git for Windows | https://git-scm.com/download/win → Next, Next দিয়ে ইনস্টল। এর সাথে **Git Credential Manager** আসে, যা প্রথমবার পাঠানোর সময় ব্রাউজারে GitHub-এ লগইন করিয়ে নেয়। |
| Node.js 22 (LTS) | https://nodejs.org → LTS। কম্পিউটারে অ্যাপ চালাতে বা test করতে লাগে; শুধু GitHub-এ তুলতে লাগে না। |
| VS Code | আপনার আছে |

চাইলে কমান্ড ছাড়া **GitHub Desktop** (https://desktop.github.com) দিয়েও করা যায়; নিচে "পথ খ" দেখুন।

## ১. GitHub-এ খালি repo বানানো

1. https://github.com/new খুলুন।
2. **Owner:** `advocate-mahbub` (বা আপনার নিজের account)
3. **Repository name:** `pronotes`
4. **Public** বেছে নিন। GitHub-এর ফ্রি প্ল্যানে Pages শুধু public repo থেকে চলে। লেআউটের সিদ্ধান্ত না নেওয়া পর্যন্ত Private রেখে পরে বদলাতে পারেন: Settings → Danger Zone → Change visibility।
5. "Add a README", ".gitignore", "license" — **কোনোটাই টিক দেবেন না।** এগুলো আমাদের কোডে আগে থেকেই আছে; টিক দিলে প্রথমবার পাঠানোর সময় আটকে যাবে।
6. **Create repository** চাপুন।

## ২. কোড কম্পিউটারে রাখা

`pronotes-repo.zip` (Claude যে zip দিয়েছে, ভেতরে লুকানো `.git` ফোল্ডারসহ পুরো ইতিহাস আছে) একটা ফোল্ডারে খুলুন, যেমন `D:\Projects\pronotes`।

> ⚠️ যে zip-এ `.git` নেই (যেমন `pronotes-v2.0-step5.zip`), সেটা দিয়েও কাজ চলে, কিন্তু commit-এর ইতিহাস যাবে না। তখন নিচে "ইতিহাস ছাড়া" অংশ দেখুন।

## ৩ক. পথ ক: VS Code-এর Terminal দিয়ে (সুপারিশ)

VS Code → **File → Open Folder** → `pronotes` ফোল্ডার। তারপর **Terminal → New Terminal**, আর এই চারটা লাইন একটা একটা করে চালান:

```bash
git status
git remote add origin https://github.com/advocate-mahbub/pronotes.git
git branch -M main
git push -u origin main
```

| লাইন | কী করে |
|---|---|
| `git status` | "On branch main … nothing to commit" দেখালে ঠিক আছে |
| `git remote add origin …` | এই ফোল্ডারকে আপনার নতুন repo-র সাথে জোড়া দেয় |
| `git branch -M main` | মূল শাখার নাম `main` নিশ্চিত করে |
| `git push -u origin main` | সব commit GitHub-এ পাঠায়; প্রথমবার ব্রাউজারে GitHub লগইন চাইবে |

এরপর GitHub-এ repo-র পাতা রিফ্রেশ করুন। সব ফাইল আর **Commits**-এ সব ধাপ (M0 … v2.0) দেখা যাবে।

**commit-এ নিজের নাম বসান (একবার):**

```bash
git config user.name "Mahbubur Rahman"
git config user.email "mahbub2bd@gmail.com"
```

## ৩খ. পথ খ: GitHub Desktop দিয়ে

1. GitHub Desktop → **File → Add local repository** → `pronotes` ফোল্ডার বাছুন।
2. **Publish repository** চাপুন। Public করতে চাইলে **"Keep this code private"**-এর টিক তুলে দিন।
   - এই পথে ধাপ ১-এর খালি repo বানাতে হয় না; GitHub Desktop নিজেই বানায়।
   - আগেই খালি repo বানিয়ে থাকলে Terminal-এর পথ (৩ক) ব্যবহার করুন, নয়তো নাম মিলবে না।

## ইতিহাস ছাড়া (`.git` নেই এমন zip থেকে)

```bash
git init -b main
git add -A
git commit -m "ProNotes v2.0"
git remote add origin https://github.com/advocate-mahbub/pronotes.git
git push -u origin main
```

(`git add -A` এখানে ঠিক আছে, কারণ ফোল্ডারে শুধু ProNotes-এর ফাইল আছে। `.gitignore` নিজে থেকেই `node_modules`, `dist` ইত্যাদি বাদ দেয়।)

## ৪. পরে বদল পাঠানো

যখন Claude নতুন commit-সহ zip দেবে, বা আপনি নিজে কিছু বদলাবেন:

```bash
git status                 # কী কী বদলেছে দেখুন
git add <ফাইলের নাম> …      # শুধু যেগুলো পাঠাতে চান (git add . না)
git commit -m "কী বদলালেন এক লাইনে"
git push
```

GitHub Pages চালু থাকলে (`docs/DEPLOY.md`) প্রতিটা `git push`-এর কয়েক মিনিট পরে সাইট নিজে থেকে নতুন হয়ে যায়। খোলা অ্যাপে "নতুন ভার্সন আছে" বার্তা আসে।

## ৫. GitHub নিজে যা পরীক্ষা করে

দুটো workflow চলে:

- **`ci.yml`:** প্রতিটা push-এ পরীক্ষা চালায় (নিচের তালিকা)।
- **`deploy.yml`:** `main`-এ push হলে আবার পরীক্ষা করে, সব পাস করলে GitHub Pages-এ বসায়।

`ci.yml` যা চালায়:

- টাইপ পরীক্ষা
- unit test
- build
- Chromium-এ ব্রাউজার test

GitHub-এ repo → **Actions** ট্যাবে সবুজ ✓ মানে সব ঠিক, লাল ✗ মানে কিছু ভেঙেছে। Public repo-তে GitHub-এর সাধারণ runner ফ্রি; এক বারে আনুমানিক ৫–৮ মিনিট লাগে। GitHub-এ এটা এখনো একবারও চলেনি, তাই প্রথমবার Actions ট্যাবটা একবার দেখে নিন।

নিজের কম্পিউটারে একই test:

```bash
npm ci
npx playwright install chromium
npx playwright test --project=chromium
```

## সমস্যা হলে

| বার্তা | কী করবেন |
|---|---|
| `remote origin already exists` | `git remote set-url origin https://github.com/advocate-mahbub/pronotes.git` |
| `rejected … fetch first` | GitHub-এ repo বানানোর সময় README টিক দিয়েছিলেন। repo মুছে আবার খালি করে বানান, অথবা `git pull --rebase origin main` তারপর `git push` |
| `Authentication failed` | Windows-এর **Credential Manager → Windows Credentials** থেকে পুরোনো `git:https://github.com` মুছে আবার push করুন |
| `'git' is not recognized` | Git for Windows ইনস্টল করে VS Code বন্ধ করে আবার খুলুন |
