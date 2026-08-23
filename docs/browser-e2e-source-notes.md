# ব্রাউজার E2E ও CI উৎস-নোট

এই নোটটি ব্রাউজার-স্তরের যাচাই ও GitHub Actions বাস্তবায়নের নকশাগত উৎস সংরক্ষণ করে।

| বিষয় | প্রয়োগযোগ্য সিদ্ধান্ত | উৎস |
|---|---|---|
| Playwright CI | GitHub Actions-এ dependency install, browser install, test execution এবং ব্যর্থতায় report artifact রাখা হবে। | [Playwright: Setting up CI](https://playwright.dev/docs/ci-intro) |
| মোবাইল emulation | Android Chrome-সদৃশ Chromium এবং iPhone-সদৃশ WebKit project দিয়ে viewport, touch, user-agent এবং screen profile যাচাই হবে; এটি বাস্তব ডিভাইস-পরীক্ষার বিকল্প নয়। | [Playwright: Emulation](https://playwright.dev/docs/emulation) |

> OAuth পরিচয় প্রদানকারী ও ব্যবহারকারীর সেশন স্বয়ংক্রিয়ভাবে ব্যবহার করা হবে না। ব্রাউজার E2E কেবল খালি প্রোফাইলের প্রকাশ্য authentication gate, PWA-সংক্রান্ত দৃশ্যমান নির্দেশনা এবং নিরাপদ export UI সীমায় থাকবে।
