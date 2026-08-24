# Vercel deployment প্রস্তুতি ও নিরাপত্তা নির্দেশনা

## উদ্দেশ্য

এই নথি `Rossy0109/Money_Tracker`-কে Vercel-এ নেওয়ার প্রস্তুতি বর্ণনা করে। বর্তমান Manus-hosted application-টি সচল fallback হিসেবে থাকবে; Vercel-এ পূর্ণ verification শেষ না হওয়া পর্যন্ত GitHub Pages redirect বা live finance endpoint বদলানো যাবে না।

## স্থাপত্য

Vercel-এর root-level `server.ts` একই Express app-কে default export করে। `server/_core/index.ts` কেবল বর্তমান persistent local/Manus runtime-এ port bind করে। ফলে tRPC router, OAuth callback, storage proxy, scheduled route এবং finance authorization logic একবারই `server/_core/app.ts`-এ নিবন্ধিত থাকে। কোনো finance procedure, ownership rule, household permission, restore transaction, বা audit write-path পরিবর্তিত হয়নি।

| উদ্বেগ | Vercel প্রস্তুতি | নিরাপত্তা ফলাফল |
|---|---|---|
| API ও হিসাবের লজিক | একই `appRouter` এবং `createContext` ব্যবহার | `userId + projectId` ও household permission contract অপরিবর্তিত |
| OAuth | বিদ্যমান nonce, host-only state cookie এবং secure session cookie অপরিবর্তিত | callback CSRF/session-fixation guard অক্ষুণ্ণ |
| Client routing | Vite bundle build-এর সময় generated `public/` directory-তে stage করা হয়; non-API SPA path `index.html`-এ rewrite | Vercel CDN static file serve করে; deep link কাজ করবে; API-কে SPA fallback গ্রাস করবে না |
| Vercel Function routing | source-controlled `api/[...path].js` Vercel-এর function discovery নিশ্চিত করে; `build:vercel` bundled shared Express handler-কে `dist/vercel-handler.js`-এ তৈরি করে। explicit `/api/(.*)` route nested tRPC procedure path-সহ সব `/api/*` অনুরোধ একই function-এ পাঠায় এবং `/manus-storage/*` একই function-এ rewrite হয়ে মূল path পুনরুদ্ধার করে | tRPC, OAuth, health এবং storage-proxy route একই shared Express app-এ থাকে; local `_core` import অনুপস্থিত থাকার runtime ঝুঁকি এড়ানো হয় এবং existing public storage URL বদলায় না |

এই layout Vercel-এর source-based function discovery এবং Build Output API-র নথির সঙ্গে সামঞ্জস্যপূর্ণ। রেফারেন্স: <https://vercel.com/docs/functions/functions-api-reference>, <https://vercel.com/docs/project-configuration/vercel-json>, এবং <https://vercel.com/docs/build-output-api/v3>।
| Private response caching | `/api/*` এবং `/manus-storage/*`-এ `no-store` header | ব্যক্তিগত finance response CDN cache-এ যাবে না |
| Live probe | `/api/healthz` কেবল `{ ok: true, service: "money-tracker" }` দেয় | কোনো database, user, project বা financial data প্রকাশ করে না |
| Rollback | বর্তমান Manus URL এবং Pages redirect অপরিবর্তিত | Vercel সমস্যা হলে user traffic বর্তমান যাচাইকৃত app-এ থাকবে |

## Vercel account ও GitHub সংযোগ

এই sandbox-এ Vercel CLI `59.5.0` পাওয়া গেছে এবং user-authorized CLI session চালু আছে। পূর্বে থাকা অন্য একটি Vercel Git connection অক্ষুণ্ণ রেখে `amar-hisab-money-tracker` নামে পৃথক project তৈরি করা হয়েছে। Vercel account-এ GitHub login হিসেবে `Rossy0109` যুক্ত আছে, কিন্তু project-এর Git selector-এ `Rossy0109/Money_Tracker` দেখা যায়নি এবং CLI connection ব্যর্থ হয়েছে। Vercel UI-এর **Adjust GitHub App Permissions** control দিয়ে Vercel GitHub App-কে ওই repository-তে অনুমতি দিতে হবে। এই permission ছাড়া CLI preview deployment সম্ভব, কিন্তু GitHub push-ভিত্তিক স্বয়ংক্রিয় preview চালু হবে না। `main` production branch থাকবে; GitHub-এর existing strict CI checks সফল না হলে PR merge করা যাবে না।

বর্তমান repository public। Finance code প্রকাশ্য হওয়ার ঝুঁকি ব্যবহারকারীকে গ্রহণযোগ্য কি না তা আলাদা সিদ্ধান্ত; repository visibility এই deployment পরিবর্তনের অংশ নয় এবং explicit approval ছাড়া বদলানো হবে না।

## প্রয়োজনীয় environment variables

নিচের মূল্যগুলো repository-তে commit করা যাবে না এবং এই নথিতে কোনো value রাখা হয়নি। Vercel project settings বা Vercel CLI-এর encrypted environment-variable command দিয়ে user-owned value বসাতে হবে। Production ও Preview আলাদা scope-এ রাখা উচিত; Preview-এ production customer database ব্যবহার করা যাবে না।

| Variable | ব্যবহার | Preview নীতি |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB database সংযোগ | কেবল disposable/staging database; production database নয় |
| `JWT_SECRET` | session token signing | আলাদা strong random secret |
| `VITE_APP_ID` | OAuth application identifier | অনুমোদিত preview app/callback ছাড়া নয় |
| `OAUTH_SERVER_URL` | OAuth token exchange backend | provider-approved value |
| `VITE_OAUTH_PORTAL_URL` | browser sign-in portal | provider-approved value |
| `OWNER_OPEN_ID`, `OWNER_NAME` | owner bootstrap metadata | minimal approved metadata |
| `ADMIN_ACCESS_PASSWORD` | administrator access guard | আলাদা, secret value |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | storage/other platform proxy | Vercel ব্যবহারের জন্য provider-authorized credential প্রয়োজন |
| `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | existing frontend platform integration | প্রকাশ্য client exposure review করে কেবল approved value |

## OAuth ও database cutover gate

পূর্ণ deployment-এর আগে provider-কে production Vercel origin-এর callback allow করতে হবে: `https://<vercel-production-domain>/api/oauth/callback`। Custom domain ব্যবহার হলে তার callback URI-ও আলাদা করে allow করতে হবে: `https://app.<your-domain>/api/oauth/callback`। Preview URL প্রতিটি branch/deployment-এ বদলাতে পারে; wildcard preview callback provider সমর্থন না করলে preview-এ OAuth test না করে production-like staging domain ব্যবহার করতে হবে।

Vercel Function-এর outbound network policy এবং database provider-এর TLS/IP policy সঙ্গতিপূর্ণ হতে হবে। কোনো managed Manus database credential বা Forge credential sandbox environment থেকে export/copy করা হবে না। User বা provider-approved credential ছাড়া Vercel-এ environment variable যোগ করা যাবে না।

## যাচাই ও rollback

প্রথমে Vercel preview-এ `GET /api/healthz`, unauthenticated `GET /api/trpc/auth.me` behavior, static PWA files এবং SPA deep-link পরীক্ষা করা হবে। Authenticated OAuth, actual financial data, restore, export বা scheduled automation কেবল staging/blank profile এবং approved callback/database দিয়ে পরীক্ষা হবে। Preview সফল, secrets/callback approved এবং production smoke check পাস হওয়ার পরে `main` থেকে production deployment করা যাবে।

সমস্যা হলে Vercel custom domain/Pages redirect পরিবর্তন না করে বর্তমান Manus endpoint চালু থাকবে। ভবিষ্যতে Vercel production cutover-এর পর সমস্যা হলে পূর্বের Vercel deployment rollback এবং Pages redirect পুনরায় বর্তমান Manus endpoint-এ রাখা হবে।

## প্রাসঙ্গিক উৎস

Vercel-এর Express function, Vite SPA rewrite, GitHub preview deployment ও encrypted environment-variable guidance-এর ভিত্তিতে এই configuration তৈরি করা হয়েছে। [1] [2] [3] [4]

[1]: https://vercel.com/docs/frameworks/backend/express
[2]: https://vercel.com/docs/frameworks/frontend/vite
[3]: https://vercel.com/docs/git/vercel-for-github
[4]: https://vercel.com/docs/environment-variables
