# Google Drive-এ ব্যাকআপ: একবারের সেটআপ

ProNotes-এর সেটিংস → অ্যাপ → **Google Drive** থেকে সব ড্রাফট, শেখা শব্দ আর সেটিংসের ব্যাকআপ নিজের Google Drive-এ রাখা যায়, আর সেখান থেকে ফেরত আনা যায়।

## কী কোথায় থাকে (নিরাপত্তা)

| জিনিস | কোথায় | GitHub-এ যায়? |
|---|---|---|
| OAuth **Client ID** | GitHub-এর Actions secret `GOOGLE_CLIENT_ID` → build-এর সময় সাইটের JS-এ | কোডে/repo-তে না। প্রকাশিত সাইটে দেখা যায়, এটা Google-এর নিয়মেই গোপন নয় |
| Client **secret** | কোথাও না (লাগেই না) | না |
| Google-এর access token | শুধু ব্যবহারকারীর ব্রাউজারের ওই ট্যাবে (sessionStorage), প্রায় এক ঘণ্টা | না |
| একাউন্টের নাম, ইমেইল | ProNotes চায়ও না, রাখেও না | না |
| ব্যাকআপ ফাইল | ব্যবহারকারীর নিজের Drive, "ProNotes Backups" ফোল্ডার | না |

অনুমতি শুধু `drive.file`: ProNotes শুধু নিজের বানানো ফাইল দেখতে পায়, Drive-এর আর কোনো ফাইল নয়। Gemini key ব্যাকআপে যায় না।

## সাইটের মালিকের একবারের কাজ

1. **Google Cloud project**: <https://console.cloud.google.com/> → নতুন project (যেমন "ProNotes")।
2. **Drive API চালু**: APIs & Services → Library → "Google Drive API" → Enable।
3. **OAuth consent screen** (Google Auth Platform → Branding/Audience):
   - User type: **External**; App name "ProNotes"; support ও developer ইমেইল নিজের।
   - Data access → Add scope: `.../auth/drive.file` (non-sensitive, তাই Google-এর যাচাই লাগে না)।
   - Audience: শুরুতে "Testing" রেখে নিজের Gmail-টা **Test users**-এ যোগ করুন; সবার জন্য খুলতে চাইলে পরে "Publish app"।
4. **OAuth Client ID**: Clients → Create client → Application type **Web application**।
   - Authorized JavaScript origins: `https://notes.mahbuburrahman.bd`
   - Authorized redirect URIs: `https://notes.mahbuburrahman.bd/` (শেষের `/` সহ, হুবহু)
   - তৈরি হলে শুধু **Client ID** কপি করুন (`…apps.googleusercontent.com`)। Client secret কোথাও রাখবেন না।
5. **GitHub secret**: repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `GOOGLE_CLIENT_ID`, Secret: কপি করা Client ID।
6. **Deploy**: Actions → Deploy → Run workflow (বা main-এ পরের merge)। এরপর সেটিংস → অ্যাপ-এ "Google দিয়ে যুক্ত করুন" দেখা যাবে।

Client ID কখনো কোডে, `.env` ফাইলে বা commit-এ লিখবেন না; শুধু GitHub secret-এ।

## ব্যবহার

- **Google দিয়ে যুক্ত করুন** → Google-এর পাতায় একাউন্ট বেছে অনুমতি → ProNotes-এ ফিরে আসে, সেটিংস খোলা থাকে।
- **Drive-এ ব্যাকআপ নিন**: একটা নতুন ফাইল যোগ হয় (পুরোনোগুলো থাকে)।
- **Drive-এর ব্যাকআপ দেখুন** → যেকোনোটার **ফেরত আনুন** (দুবার চাপ দিয়ে নিশ্চিত)।
- **বিচ্ছিন্ন করুন**: token মুছে Google-কে বাতিল করতে বলা হয়।
- এক ঘণ্টা পর অনুমতি শেষ হলে আবার যুক্ত করতে হয়; ব্যাকআপ চাপলে নিজেই Google-এ নিয়ে যায়, ফিরে এসে ব্যাকআপ নেয়।
