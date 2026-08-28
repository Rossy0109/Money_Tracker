# Vercel এনভায়রনমেন্ট ও সিক্রেট সেটআপ নির্দেশিকা

এই নথিতে Money Tracker (আমার হিসাব) অ্যাপ্লিকেশনের জন্য Vercel Preview এবং Production এনভায়রনমেন্টে ভ্যারিয়েবল ও সিক্রেট সেটআপ করার পূর্ণাঙ্গ ধাপসমূহ তুলে ধরা হলো।

---

## ১. Vercel ড্যাশবোর্ডে প্রয়োজনীয় ভ্যারিয়েবল তালিকা

Vercel প্রজেক্টে **Settings** -> **Environment Variables** সেকশনে গিয়ে নিচের ভ্যারিয়েবলগুলো যুক্ত করুন:

| ভ্যারিয়েবল নাম | এনভায়রনমেন্ট | বিবরণ ও উদাহরণ |
|---|---|---|
| `AUTH_MODE` | Preview, Production | মান দিন: `google` |
| `VITE_AUTH_MODE` | Preview, Production | মান দিন: `google` |
| `GOOGLE_OAUTH_CLIENT_ID` | Preview, Production | Google Cloud Console থেকে প্রাপ্ত OAuth Web Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Preview, Production | Google OAuth Web Client Secret (সুরক্ষিত সিক্রেট) |
| `GOOGLE_OAUTH_REDIRECT_URI` | Preview, Production | `https://<your-domain>.vercel.app/api/auth/google/callback` |
| `DATABASE_URL` | Preview, Production | TiDB Serverless / MySQL connection string (TLS সহ) |
| `SESSION_SECRET` | Preview, Production | ন্যূনতম ৩২ অক্ষরের ক্রিপ্টোগ্রাফিক র‍্যান্ডম স্ট্রিং |
| `JWT_SECRET` | Preview, Production | ন্যূনতম ৩২ অক্ষরের র‍্যান্ডম সিক্রেট স্ট্রিং |
| `ADMIN_BOOTSTRAP_EMAIL` | Preview, Production | আপনার ভেরিফাইড ইমেইল (যেমন: `kamrul01@gmail.com`) |
| `ADMIN_ACCESS_PASSWORD` | Preview, Production | অ্যাডমিনিস্ট্রেটর ২FA যাচাইকরণের নিরাপদ পাসওয়ার্ড |
| `BLOB_READ_WRITE_TOKEN` | Preview, Production | Vercel Storage ট্যাব থেকে Blob Store লিংক করলে অটো-ইনজেক্ট হয় |

---

## ২. Google Cloud Console OAuth কনফিগারেশন

1. **Google Cloud Console** -> **APIs & Services** -> **Credentials**-এ যান।
2. **OAuth 2.0 Client IDs** -> **Web application** তৈরি বা নির্বাচন করুন।
3. **Authorized JavaScript origins:**
   - Production: `https://amar-hisab-money-tracker.vercel.app`
   - Preview: `https://amar-hisab-money-tracker-git-staging-rossy0109s-projects.vercel.app`
4. **Authorized redirect URIs:**
   - Production: `https://amar-hisab-money-tracker.vercel.app/api/auth/google/callback`
   - Preview: `https://amar-hisab-money-tracker-git-staging-rossy0109s-projects.vercel.app/api/auth/google/callback`
5. প্রাপ্ত `Client ID` এবং `Client Secret` Vercel Environment Variables-এ দিন।

---

## ৩. TiDB Serverless ডাটাবেস সেটআপ ও স্কিমা মাইগ্রেশন

1. [TiDB Cloud](https://tidbcloud.com)-এ একটি Serverless (Free Tier) ক্লাস্টার তৈরি করুন।
2. ক্লাস্টার থেকে **Connect** বাটনে ক্লিক করে **Node.js** বা **General MySQL** সিলেক্ট করুন এবং TLS এনাবল্ড কানেকশন স্ট্রিং নিন:
   ```text
   mysql://<user>:<password>@gateway01.<region>.tidbcloud.com:4000/<database_name>?ssl={"rejectUnauthorized":true}
   ```
3. লোকাল টার্মিনাল থেকে শুধুমাত্র খালি স্টেজিং ডাটাবেসে স্কিমা তৈরি করতে রান করুন:
   ```bash
   DATABASE_URL="your-tidb-connection-url" pnpm db:push
   ```

---

## ৪. Vercel Blob প্রাইভেট অবজেক্ট স্টোরেজ

1. Vercel প্রজেক্টের **Storage** ট্যাবে যান।
2. **Connect Store** -> **Blob** সিলেক্ট করে একটি নতুন স্টোর (`amar-hisab-staging-backups`) তৈরি করুন।
3. স্টোরটি আপনার প্রজেক্টের সাথে কানেক্ট করুন; Vercel স্বয়ংক্রিয়ভাবে `BLOB_READ_WRITE_TOKEN` এনভায়রনমেন্টে ইনজেক্ট করবে।

---

## ৫. ডিপ্লয়মেন্ট ভেরিফিকেশন ও ব্ল্যাংক-প্রোফাইল টেস্ট

1. Vercel ড্যাশবোর্ড থেকে নতুন ডিপ্লয়মেন্ট ট্রিগার করুন অথবা GitHub-এ পুশ করুন।
2. ডিপ্লয়মেন্ট শেষে প্রিভিউ লিঙ্কে ব্রাউজার ওপেন করুন।
3. **Google Sign-In** বাটনে ক্লিক করে লগইন পরীক্ষা করুন।
4. লগইনের পর ইউজার আইসোলেশন, নতুন লেনদেন যোগ করা ও ব্যাকআপ এক্সপোর্ট ফাংশনালিটি কোনো বাস্তব ডাটা ছাড়াই যাচাই করুন।
