# Supabase Staging Migration Assessment

## উদ্দেশ্য ও সীমা

এই নথিটি ব্যবহারকারীর নতুন অনুরোধ—Vercel frontend/backend-এর সঙ্গে Supabase Database, Auth ও private Storage ব্যবহার—মূল্যায়নের প্রাথমিক রেকর্ড। এটি **কোনও migration অনুমোদন নয়**। বর্তমান Manus live fallback, GitHub Pages redirect, Vercel Blob-এর বিদ্যমান নিরাপত্তা নিয়ন্ত্রণ, এবং বাস্তব আর্থিক ডেটা অপরিবর্তিত থাকবে। প্রথম কাজ হবে শুধু empty staging project ও blank-profile verification।

## অফিসিয়াল নিরাপত্তা-তথ্য

Supabase-এর PostgreSQL Row Level Security (RLS) প্রতিটি query-তে নীতিমালা প্রয়োগ করে এবং `auth.uid()` দিয়ে authenticated user-এর row ownership নিয়ন্ত্রণ করা যায়। Exposed schema-র প্রতিটি table-এ RLS enable করার পাশাপাশি `anon` ও `authenticated` role-এর grants আলাদাভাবে সীমিত করতে হয়; শুধু policy যোগ করলেই default grants অপসারিত হয় না। Supabase-এর `service_role` RLS bypass করে, তাই এটি কেবল server-side secret হিসেবে রাখতে হবে এবং browser-এ প্রকাশ করা যাবে না। [1]

Supabase Storage-এ private bucket default access model। Private bucket থেকে download করতে user JWT ও RLS policy ব্যবহার করতে হয়, অথবা সীমিত-মেয়াদের signed URL দিতে হয়। সেই কারণে finance backup/export-এ raw object key, public URL, বা key-obscurity-ভিত্তিক access গ্রহণযোগ্য নয়; বর্তমান metadata-backed owner/project/household authorizationকে Supabase Storage-এর `storage.objects` policy ও server-side procedure-এ পুনরায় প্রমাণ করতে হবে। [2]

Supabase-এর server-side Auth guidance cookie-backed server flow ও PKCE সমর্থন করে, কিন্তু এই Vite/Express application Next.js SSR নয়। তাই বর্তমান Google PKCE implementation একবারে মুছে ফেলা যাবে না। একটি explicit `AUTH_MODE=supabase` staging mode, Supabase JWT verification, cookie/session boundary, user identity mapping এবং rollback-safe `AUTH_MODE=manus` fallback লাগবে। [3]

## প্রাথমিক architectural implication

| ক্ষেত্র | বর্তমান staging path | Supabase plan-এর ন্যূনতম-পরিবর্তনের প্রয়োজন |
|---|---|---|
| Database | MySQL/TiDB-oriented Drizzle schema ও `mysql2` | PostgreSQL driver, dialect, migration set, UTC/time/decimal semantics এবং project/household access tests পুনরায় যাচাই |
| Authentication | Manus fallback + isolated Google PKCE staging mode | Supabase Auth identity JWT-কে internal finance user ID-এর সঙ্গে নিরাপদে map; admin bootstrap ও role preservation পুনঃনকশা |
| Storage | private Vercel Blob + metadata-protected stream route | Supabase private bucket + RLS `storage.objects` policies; object metadata ও owner/project/household checks ধরে রাখা |
| Backend | Vercel Express catch-all | Server-only Supabase service credential; browser-এ service-role key নয় |

## বর্তমান কোড অডিট ও ন্যূনতম-পরিবর্তনের সিদ্ধান্ত

বর্তমান database layer সরাসরি MySQL dialect-এ লেখা: `drizzle-orm/mysql2`, `mysqlTable`/`mysqlEnum`, MySQL auto-increment `insertId`, `onDuplicateKeyUpdate`, এবং affected-row ভিত্তিক accounting concurrency guard ব্যবহৃত হয়েছে। এগুলো PostgreSQL-এ একই API বা return shape দেয় না। তাই শুধু `DATABASE_URL` Supabase-এর URL-এ বদলানো নিরাপদ নয়; তাতে voucher numbering, account balance, due settlement, restore rollback এবং audit consistency ভেঙে যেতে পারে।

ন্যূনতম-পরিবর্তনের নিরাপদ পথ হলো **dual, explicit staging modes**। `DB_MODE=mysql` বর্তমান Manus/legacy runtime-এর default থাকবে; `DB_MODE=supabase-postgres` কেবল empty Preview staging-এ নতুন PostgreSQL Drizzle schema ও repository adapter চালাবে। PostgreSQL adapter-এ `RETURNING`-ভিত্তিক inserted ID, `onConflictDoUpdate`, transaction rollback এবং row-count compare স্পষ্টভাবে test করতে হবে। একটি mode অন্যটির migration বা data কখনও পড়বে না।

Authentication-এর ক্ষেত্রেও একই নিয়ম: `AUTH_MODE=manus` বর্তমান live fallback, `AUTH_MODE=google` আগের isolated staging experiment, এবং নতুন `AUTH_MODE=supabase` আলাদা থাকবে। Supabase Auth থেকে পাওয়া verified subject (`auth.users.id`) internal `users.id`-এর সঙ্গে deterministic `supabase:<uuid>` external identity হিসেবে map হবে। Session/JWT যাচাই server-side হবে; browser-এ service-role credential কখনও যাবে না।

Storage-এ `STORAGE_MODE=vercel-blob` বর্তমান hardened staging transport; `STORAGE_MODE=supabase` হলে private bucket, relational object metadata এবং owner/project/household access check একই থাকবে। Raw object key, public bucket বা client-side service-role access গ্রহণ করা হবে না। Server route verified user ও metadata check-এর পরে private object stream করবে; RLS হবে দ্বিতীয় স্তরের প্রতিরক্ষা।

| স্তর | বর্তমান প্রমাণিত পথ | Supabase staging mode | অপরিবর্তনীয় নিরাপত্তা সীমা |
|---|---|---|---|
| Finance DB | MySQL/TiDB Drizzle | PostgreSQL Drizzle adapter | internal numeric user ID, project scope, household roles, voucher/accounting transaction intact |
| Login | Manus অথবা staged Google cookie | Supabase Auth verified JWT/cookie | server-side issuer/audience/subject verification এবং admin bootstrap allowlist |
| Files | private Vercel Blob + metadata | private Supabase bucket + metadata | no raw-key download, no public backup/export URL, owner/household denial test |
| Deploy | Vercel Express/Vite | একই Vercel Express/Vite | GitHub protected PR/CI; Production env ও live fallback untouched |

## সিদ্ধান্তের পূর্বশর্ত

1. Supabase staging project অবশ্যই empty হতে হবে এবং কোনও Manus credential বা বাস্তব finance data import করা যাবে না।
2. PostgreSQL migration SQL প্রতিটি statement পর্যালোচনা ছাড়া execute করা যাবে না; MySQL DDL সরাসরি চালানো যাবে না।
3. প্রতিটি finance table ও storage object-এর জন্য `anon` deny, authenticated own-user allow, cross-user deny, project/household policy tests প্রয়োজন।
4. Supabase Auth migration কেবল blank profile-এ পরীক্ষা হবে; বর্তমান live Manus endpoint পরিবর্তন করা যাবে না।
5. `auth.users`, finance schema এবং `storage.objects`-এর RLS policy একসঙ্গে review ও test ছাড়া কোনও Supabase service key বা database migration staging-এও ব্যবহার করা যাবে না।

## Sources

[1] [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

[2] [Supabase — Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

[3] [Supabase — Server-Side Auth](https://supabase.com/docs/guides/auth/server-side)
