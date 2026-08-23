# মোবাইল, PWA, রপ্তানি ও CI যাচাই প্রতিবেদন

**তারিখ:** ২৪ আগস্ট ২০২৬ (GMT+৬)  
**যাচাইয়ের ধরন:** বাস্তব অর্থনৈতিক ডেটা ছাড়া disposable local MariaDB, Playwright-এর মোবাইল ব্রাউজার এমুলেশন, স্বয়ংক্রিয় রিগ্রেশন এবং প্রোডাকশন বিল্ড।

## বাস্তবায়িত পরিবর্তন

রপ্তানি-নির্ভর ভারী লাইব্রেরিগুলোকে আর ড্যাশবোর্ডের প্রাথমিক লোডে আনা হয় না। মাসিক PDF এবং পারিবারিক চার্ট রপ্তানির মডিউল ব্যবহারকারী রপ্তানি বোতাম চাপলে `import()` দিয়ে আনা হয়। প্রোডাকশন বিল্ডে `html2canvas`, `jspdf`, `monthlyReportPdf` এবং household-export মডিউল আলাদা চাঙ্ক হিসেবে বেরিয়েছে।

PWA সুবিধার জন্য `manifest.webmanifest`, অ্যাপ আইকন, `sw.js` এবং privacy-safe `offline.html` যোগ করা হয়েছে। সার্ভিস ওয়ার্কার নেভিগেশন শেলের জন্য offline fallback দেয়, কিন্তু `/api/` অনুরোধ ক্যাশ করে না; ফলে আর্থিক API ডেটা browser cache-এ সংরক্ষিত হয় না। প্রোডাকশনে স্বাভাবিকভাবে রেজিস্ট্রেশন হয় এবং disposable browser test server-এ কেবল `VITE_PWA_E2E=true` হলে তা সক্রিয় হয়।

## নিয়ন্ত্রিত ফলাফল

| ক্ষেত্র | যাচাই | ফলাফল |
|---|---|---|
| Android Chrome এমুলেশন | খালি প্রোফাইলে সাইন-ইন গেট, আর্থিক নিয়ন্ত্রণ লুকানো, manifest ও offline worker | পাস |
| iPhone Safari (WebKit) এমুলেশন | খালি প্রোফাইলে সাইন-ইন গেট, আর্থিক নিয়ন্ত্রণ লুকানো, manifest link | পাস |
| PDF/PNG export | lazy-import wiring এবং PDF/chart helper-এর রিগ্রেশন | পাস |
| restore recovery | ব্যর্থ বা বাতিল রিস্টোরে উৎস প্রজেক্ট অক্ষত; নিশ্চিত রিস্টোর আলাদা প্রজেক্টে | পাস |
| বিচ্ছিন্ন database E2E | role, invitation এবং restore recovery বাস্তব tRPC-to-MariaDB প্রবাহ | পাস |
| সাধারণ রিগ্রেশন | ৩৬টি টেস্ট ফাইল, ১১২টি টেস্ট | পাস |
| TypeScript ও production build | `pnpm check`, `pnpm build` | পাস |

## CI ব্যবস্থা

`.github/workflows/ci.yml` এখন `main` push, pull request এবং manual dispatch-এ চলে। `quality` job-এ সাধারণ রিগ্রেশন, type check ও build হয়। `isolated-e2e` job GitHub Actions-এর ক্ষণস্থায়ী MariaDB 11 service ব্যবহার করে। এটি `test:e2e:isolated` এবং Chromium/WebKit-এর blank-profile browser E2E চালায়। কোনো প্রোডাকশন database URL বা ব্যবহারকারীর গোপন তথ্য CI-তে দেওয়া হয় না।

## সীমাবদ্ধতা

এই যাচাই Android Chrome ও iPhone Safari-এর Playwright device emulation-এ হয়েছে। বাস্তব ফোনে OAuth সাইন-ইন, OS-নির্ভর PWA installation prompt এবং বাস্তব ব্যবহারকারীর PDF download চালানো হয়নি; কারণ খালি authenticated test profile দেওয়া হয়নি এবং বাস্তব ব্যবহারকারীর session/finance data স্পর্শ করা হয়নি। WebKit emulator সার্ভিস-worker lifecycle স্থিরভাবে প্রকাশ না করায় সেখানে manifest ও auth-gate যাচাই করা হয়েছে; Chromium-এ worker registration-ও যাচাই হয়েছে।

প্রধান application chunk এখনও 500 kB সতর্কসীমার ওপরে। এই পরিবর্তনে PDF/PNG capture library আলাদা হয়েছে, তবে সম্পূর্ণ প্রাথমিক লোড উন্নয়নের জন্য পরবর্তী ধাপে dashboard dependency বিশ্লেষণ ও আরও route-level split প্রয়োজন।

## নিরাপদ ম্যানুয়াল ডিভাইস যাচাইয়ের প্রস্তাবিত ধাপ

1. আলাদা খালি test profile দিয়ে Android Chrome এবং iPhone Safari-তে সাইন-ইন করুন।
2. কেবল খালি test project-এ PWA install prompt এবং একটি sample PDF/PNG export পরীক্ষা করুন।
3. test profile-এর ফল নিশ্চিত হলে স্বাভাবিক ব্যবহারকারী প্রোফাইলে পরিবর্তন না করেই প্রতিবেদনটি সংরক্ষণ করুন।
