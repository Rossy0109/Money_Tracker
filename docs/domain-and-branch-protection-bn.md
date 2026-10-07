# ডোমেইন ও GitHub branch protection অবস্থা

## Main branch protection

`Rossy0109/Money_Tracker` একটি ব্যক্তিগত-account repository হওয়ায় organization-only user/team restriction প্রযোজ্য নয়। তাই `main`-এ নিচের নিরাপদ ও ব্যবহারযোগ্য নীতি প্রয়োগ করা হয়েছে:

| নীতি                                     | অবস্থা |
| ---------------------------------------- | ------ |
| আপ-টু-ডেট branch বাধ্যতামূলক             | চালু   |
| `verify` বাধ্যতামূলক                    | চালু   |
| `test` বাধ্যতামূলক                       | চালু   |
| `worker` বাধ্যতামূলক                     | চালু   |
| `e2e` বাধ্যতামূলক                       | চালু   |
| `browser-e2e` বাধ্যতামূলক               | চালু   |
| force push                               | নিষিদ্ধ |
| branch deletion                          | নিষিদ্ধ |
| conversation resolution বাধ্যতামূলক      | চালু   |
| stale review dismissal                   | চালু   |
| administrator enforcement                | চালু   |
| approving-review requirement             | বন্ধ   |
| `require_code_owner_reviews`            | বন্ধ   |

**2026-10-07 আপডেট:** আগে কেবল দুটি required check (`verify` + `e2e`), force push ও deletion Allow ছিল। এখন পাঁচটি check রয়েছে (`worker` যোগ), force push ও deletion নিষিদ্ধ, এবং administrator-o bypass করতে পারবে না (`enforce_admins` চালু)। approving review ও code-owner review ইচ্ছাকৃতভাবে বন্ধ — কারণ একমাত্র সক্রিয় committer `@Rossy0109`; requirement দিলে নিজের PR-ই merge করা যেত না। `.github/CODEOWNERS` ফাইল রয়েছে, কিন্তু enforcement অফ। দ্বিতীয় owner সক্রিয় হলে দুটি আবার চালু করা হবে (AGENTS.md দেখুন)।

CI-এর commit `f9a0e864187c2700976ba0bb859db5c0a1cb345c`-এ দুটি required check সফল হয়েছিল। Administrator enforcement আগে ইচ্ছাকৃতভাবে বন্ধ ছিল — জরুরি recovery path এখন প্রয়োজন হলে `gh api -X PUT repos/Rossy0109/Money_Tracker/branches/main/protection ...` দিয়ে config overwrite করা যাবে (`/data/...` backup দেখুন)।

## Custom domain-এর জন্য প্রয়োজনীয় তথ্য

পূর্ণ-stack application বর্তমানে Vercel production deployment-এ চলে। GitHub Pages কেবল redirect করে। একটি domain পাওয়া গেলে দুইটি আলাদা hostname ব্যবহার করা নিরাপদ: `app.<আপনার-domain>` live app-এর জন্য এবং `www.<আপনার-domain>` Pages redirect-এর জন্য। DNS provider-এ domain ownership ছাড়া record বা hosting binding সম্পন্ন করা সম্ভব নয়।
