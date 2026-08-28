# স্টেজিং কনফিগারেশন যাচাই নোট

এই নোটে কেবল অগোপন configuration evidence রাখা হয়েছে। কোনও OAuth secret, database connection string, session secret, Blob token বা আর্থিক ডেটা লেখা হয়নি।

## ২৬ আগস্ট ২০২৬: Google OAuth client যাচাই

Google Cloud project **Ahmed Builders Ltd**-এর Credentials তালিকায় একাধিক OAuth/API credential ছিল। `Web client (auto created by Google Service)` নামের বিদ্যমান client-টি পরীক্ষা করা হয়েছে। এটি `amar-hisab-staging` client নয় এবং তার authorized redirect URI তালিকায় Money Tracker-এর staging callback নেই। তাই এই client-এর client ID বা secret Money Tracker staging-এ ব্যবহার করা যাবে না।

Money Tracker-এর প্রয়োজনীয় callback URI হলো:

```text
https://amar-hisab-money-tracker-git-staging-rossy0109s-projects.vercel.app/api/auth/google/callback
```

নাম-নির্দিষ্ট `amar-hisab-staging` OAuth web client-টি পরে নির্বাচন করে যাচাই করা হয়েছে। তার পূর্ববর্তী registered redirect URI ছিল production alias `https://amar-hisab-money-tracker.vercel.app/api/auth/google/callback`। পুরোনো URI অক্ষত রেখে নিচের Preview callback-টিও অনুমোদিত URI হিসেবে যোগ করে Save করা হয়েছে:

```text
https://amar-hisab-money-tracker-git-staging-rossy0109s-projects.vercel.app/api/auth/google/callback
```

এই `amar-hisab-staging` client-এর অগোপন **Client ID** Vercel Preview-তে `GOOGLE_OAUTH_CLIENT_ID` নামে যোগ করা হয়েছে। Client secret-এর মান কখনও নথিতে বা চ্যাটে লেখা যাবে না এবং কেবল `GOOGLE_OAUTH_CLIENT_SECRET` Preview secret হিসেবে ব্যবহার হবে।

## Vercel Preview variable cleanup

সঠিক `GOOGLE_OAUTH_CLIENT_SECRET` নামের একটি Preview-only secret entry নিশ্চিত হয়েছে। `AUTH_MODE`, `VITE_AUTH_MODE` এবং `GOOGLE_OAUTH_REDIRECT_URI`-ও Preview-only। পূর্বের ভুল-নামের Preview entries অপসারণ করা হয়েছে। Production environment এবং `BLOB_READ_WRITE_TOKEN` পরিবর্তন করা হয়নি।

## পরবর্তী নিরাপদ gate

1. TiDB TLS URL, Preview-only `SESSION_SECRET`, এবং `ADMIN_BOOTSTRAP_EMAIL` দেওয়া।
2. Schema শুধুমাত্র empty TiDB staging database-এ প্রয়োগের আগে migration SQL পুনরায় পর্যালোচনা।
3. কোনও বাস্তব আর্থিক ডেটা ছাড়া blank-profile Google sign-in পরীক্ষা।
