# ডোমেইন ও GitHub branch protection অবস্থা

## Main branch protection

`Rossy0109/Money_Tracker` একটি ব্যক্তিগত-account repository হওয়ায় organization-only user/team restriction প্রযোজ্য নয়। তাই `main`-এ নিচের নিরাপদ ও ব্যবহারযোগ্য নীতি প্রয়োগ করা হয়েছে:

| নীতি | অবস্থা |
|---|---|
| আপ-টু-ডেট branch বাধ্যতামূলক | চালু |
| `Regression, type check, and build` বাধ্যতামূলক | চালু |
| `Disposable MariaDB API and browser E2E` বাধ্যতামূলক | চালু |
| force push | নিষিদ্ধ |
| branch deletion | নিষিদ্ধ |
| administrator emergency recovery | অনুমোদিত |

CI-এর commit `f9a0e864187c2700976ba0bb859db5c0a1cb345c`-এ দুটি required check সফল হয়েছে। Administrator enforcement ইচ্ছাকৃতভাবে বন্ধ রাখা হয়েছে, যাতে repository owner জরুরি পুনরুদ্ধার বা ভুল configuration ঠিক করতে পারেন।

## Custom domain-এর জন্য প্রয়োজনীয় তথ্য

পূর্ণ-stack application বর্তমানে `https://moneytrack-2tqvjvuy.manus.space/`-এ চলে। GitHub Pages কেবল redirect করে। একটি domain পাওয়া গেলে দুইটি আলাদা hostname ব্যবহার করা নিরাপদ: `app.<আপনার-domain>` live app-এর জন্য এবং `www.<আপনার-domain>` Pages redirect-এর জন্য। DNS provider-এ domain ownership ছাড়া record বা hosting binding সম্পন্ন করা সম্ভব নয়।
