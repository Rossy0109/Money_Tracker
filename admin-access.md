# Admin ও User ব্যবহারের নিরাপত্তা নির্দেশনা

## User সাইন-ইন

প্রতিটি ব্যবহারকারী নিজের Gmail-সামঞ্জস্যপূর্ণ Manus OAuth account দিয়ে সাইন-ইন করেন। সাইন-ইনের পর তারা কেবল নিজের Project workspace, হিসাব, account, category, budget, bill এবং export দেখতে বা পরিবর্তন করতে পারেন। Project `Face Two Button` একটি আলাদা হিসাবখাতা; কোনো project-এর record অন্য project-এ দেখা যায় না।

## Admin সাইন-ইন ও যাচাই

Admin-ও প্রথমে Manus OAuth দিয়ে সাইন-ইন করেন। Owner account-এর role `admin` হয়। তারপর Admin button থেকে server-side administrator password দিয়ে দ্বিতীয় ধাপের যাচাই সম্পন্ন করতে হয়। Passwordটি application code, GitHub, browser storage বা audit log-এ রাখা হয় না।

## Admin control

সফল যাচাইয়ের পর Admin control dialog-এ কেবল administrator-এর জন্য নিম্নলিখিত system-management তথ্য দেখা যায়:

| অংশ | কী দেখা যায় |
|---|---|
| Audit log | Create, update ও delete-সংক্রান্ত activity, actor, project এবং সময় |
| সব Project | Project name ও owner পরিচিতি |
| নিবন্ধিত ব্যবহারকারী | ব্যবহারকারীর display identity, role এবং সর্বশেষ সাইন-ইন |

Audit log নতুন create, update ও delete action-এ append হয়; UI থেকে এটি edit বা delete করার কোনো সুবিধা নেই। Admin monitoring interface ব্যবহারকারীর ব্যক্তিগত finance records-এর সরাসরি editing surface দেয় না; এটি user privacy ও project isolation বজায় রাখে।
