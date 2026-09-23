# Vercel deployment প্রস্তুতি ও নিরাপত্তা নির্দেশনা

## উদ্দেশ্য

এই নথি `Rossy0109/Money_Tracker`-কে Vercel-এ নেওয়ার প্রস্তুতি বর্ণনা করে। Vercel deployment-ই production runtime; GitHub Pages কেবল static redirect পরিবেশন করে।

## স্থাপত্য

Vercel-এর root-level `server.ts` একই Express app-কে default export করে। `server/_core/index.ts` কেবল persistent local runtime-এ port bind করে। ফলে tRPC router, OAuth callback, storage proxy, scheduled route এবং finance authorization logic একবারই `server/_core/app.ts`-এ নিবন্ধিত থাকে। কোনো finance procedure, ownership rule, household permission, restore transaction, বা audit write-path পরিবর্তিত হয়নি।

| উদ্বেগ | Vercel প্রস্তুতি | নিরাপত্তা ফলাফল |
|---|---|---|
| API ও হিসাবের লজিক | একই `appRouter` এবং `createContext` ব্যবহার | `userId + projectId` ও household permission contract অপরিবর্তিত |
| OAuth | বিদ্যমান nonce, host-only state cookie এবং secure session cookie অপরিবর্তিত | callback CSRF/session-fixation guard অক্ষুণ্ণ |
| Client routing | Vite bundle build-এর সময় generated `public/` directory-তে stage করা হয়; non-API SPA path `index.html`-এ rewrite | Vercel CDN static file serve করে; deep link কাজ করবে; API-কে SPA fallback গ্রাস করবে না |
| Vercel Function routing | source-controlled `api/[...path].js` Vercel-এর function discovery নিশ্চিত করে; `build:vercel` bundled shared Express handler-কে `dist/vercel-handler.js`-এ তৈরি করে। explicit `/api/(.*)` route nested tRPC path একই function-এ পাঠায় | private Blob object-এ metadata-backed owner/project/household authorization ছাড়া download grant হয় না |

এই layout Vercel-এর source-based function discovery এবং Build Output API-র নথির সঙ্গে সামঞ্জস্যপূর্ণ। রেফারেন্স: <https://vercel.com/docs/functions/functions-api-reference>, <https://vercel.com/docs/project-configuration/vercel-json>, এবং <https://vercel.com/docs/build-output-api/v3>।
| Private response caching | `/api/*`-এ `no-store` header | ব্যক্তিগত finance response CDN cache-এ যাবে না |
| Live probe | `/api/healthz` কেবল `{ ok: true, service: "money-tracker" }` দেয় | কোনো database, user, project বা financial data প্রকাশ করে না |
| Rollback | পূর্বের Vercel deployment | Vercel সমস্যা হলে পূর্বের production deployment-এ rollback করা যাবে |

## Vercel account ও GitHub সংযোগ

এই sandbox-এ Vercel CLI `59.5.0` পাওয়া গেছে এবং user-authorized CLI session চালু আছে। পূর্বে থাকা অন্য একটি Vercel Git connection অক্ষুণ্ণ রেখে `amar-hisab-money-tracker` নামে পৃথক project তৈরি করা হয়েছে। User-authorized Vercel GitHub App permission-এর পরে `Rossy0109/Money_Tracker` ওই project-এ সংযুক্ত হয়েছে; protected `main` merge এখন Vercel production deployment trigger করে। `main` production branch থাকবে; GitHub-এর existing strict CI checks সফল না হলে PR merge করা যাবে না।

বর্তমান repository public। Finance code প্রকাশ্য হওয়ার ঝুঁকি ব্যবহারকারীকে গ্রহণযোগ্য কি না তা আলাদা সিদ্ধান্ত; repository visibility এই deployment পরিবর্তনের অংশ নয় এবং explicit approval ছাড়া বদলানো হবে না।

## প্রয়োজনীয় environment variables

নিচের মূল্যগুলো repository-তে commit করা যাবে না এবং এই নথিতে কোনো value রাখা হয়নি। Vercel project settings বা Vercel CLI-এর encrypted environment-variable command দিয়ে user-owned value বসাতে হবে। Production ও Preview আলাদা scope-এ রাখা উচিত; Preview-এ production customer database ব্যবহার করা যাবে না।

| Variable | ব্যবহার | Preview নীতি |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB database সংযোগ | কেবল disposable/staging database; production database নয় |
| `JWT_SECRET`, `SESSION_SECRET` | session token signing | আলাদা strong random secret |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Google OAuth (`AUTH_MODE=google`) | Preview-এ Preview-only client; Production-এ production client |
| `OWNER_OPEN_ID` | owner bootstrap metadata | minimal approved metadata |
| `ADMIN_ACCESS_PASSWORD` | administrator access guard | আলাদা, secret value |

### Provider-neutral Preview variables

নিচের নামগুলো provider-neutral adapter-এর জন্য। কোনো value এই repository-তে, browser variable-এ, বা chat-এ লেখা যাবে না।

| Variable | Preview policy |
|---|---|
| `DATABASE_URL` | কেবল খালি TiDB TLS staging database |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | canonical Google callback implement হওয়ার পরে server-side Preview-only configuration |
| `GOOGLE_OAUTH_REDIRECT_URI` | Google Console allowlist-এর সাথে exact match |
| `SESSION_SECRET`, `ADMIN_BOOTSTRAP_EMAIL` | নতুন staged session/bootstrap guard |
| `BLOB_READ_WRITE_TOKEN` | private Blob-এর Vercel-injected Development/Preview server credential; কোনো source, browser বা chat exposure নয় |

## OAuth ও database cutover gate

Google OAuth-এর জন্য canonical callback হলো **`/api/auth/google/callback`**। Google Console-এ redirect URI কেবল নির্ধারিত Preview origin-এর সঙ্গে এই path জুড়ে নিবন্ধন করতে হবে; Preview URL নিশ্চিত হওয়ার আগে কোনো production alias allowlist করা যাবে না।

Vercel Function-এর outbound network policy এবং database provider-এর TLS/IP policy সঙ্গতিপূর্ণ হতে হবে। কোনো credential sandbox environment থেকে export/copy করা হবে না। User বা provider-approved credential ছাড়া Vercel-এ environment variable যোগ করা যাবে না।

## যাচাই ও rollback

প্রথমে Vercel preview-এ `GET /api/healthz`, unauthenticated `GET /api/trpc/auth.me` behavior, static PWA files এবং SPA deep-link পরীক্ষা করা হবে। Authenticated OAuth, actual financial data, restore, export বা scheduled automation কেবল staging/blank profile এবং approved callback/database দিয়ে পরীক্ষা হবে। Preview সফল, secrets/callback approved এবং production smoke check পাস হওয়ার পরে `main` থেকে production deployment করা যাবে।

সমস্যা হলে পূর্বের যাচাইকৃত Vercel deployment-এ rollback করা যাবে। ভবিষ্যতে production সমস্যা হলে পূর্বের Vercel deployment rollback করা হবে।

### Pull request 98 preview evidence

2026-08-25-এ protected Vercel preview `amar-hisab-money-tracker-16w0pi9bk-rossy0109s-projects.vercel.app` browser-এর authenticated Vercel session দিয়ে non-mutatingভাবে পরীক্ষা করা হয়েছে। `GET /api/healthz` প্রত্যাশিত `{"ok":true,"service":"money-tracker"}` দিয়েছে এবং unauthenticated `auth.me` batch result `null` দিয়েছে। Opaque storage-object request প্রত্যাশিত protected-download message-এ denied হয়েছে; ফলে কোনো object access grant হয়নি। State ও code-ছাড়া Google callback request প্রত্যাশিত guard error দিয়েছে। CLI-based anonymous request Vercel SSO protection-এ redirect হয়েছিল; এটি app failure নয় এবং preview protection কার্যকর থাকার প্রমাণ। কোনো sign-in, database write, backup/export, Blob upload, বা secret inspection করা হয়নি।

Pull request 98 merge-এর পরে production alias `amar-hisab-money-tracker.vercel.app`-ও health endpoint-এ একই non-sensitive success response দিয়েছে। সেখানে opaque raw storage key-র response ছিল `Storage proxy not configured`, কারণ production-এ Blob storage credential ইচ্ছাকৃতভাবে নেই। এটি কোনো private object-এর access দেয়নি এবং production finance cutover বা data migration বোঝায় না।

## প্রাসঙ্গিক উৎস

Vercel-এর Express function, Vite SPA rewrite, GitHub preview deployment ও encrypted environment-variable guidance-এর ভিত্তিতে এই configuration তৈরি করা হয়েছে। [1] [2] [3] [4]

[1]: https://vercel.com/docs/frameworks/backend/express
[2]: https://vercel.com/docs/frameworks/frontend/vite
[3]: https://vercel.com/docs/git/vercel-for-github
[4]: https://vercel.com/docs/environment-variables
