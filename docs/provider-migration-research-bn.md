# প্রোভাইডার-নিরপেক্ষ Vercel স্টেজিং মাইগ্রেশন নকশা

## উদ্দেশ্য ও অপরিবর্তনীয় সীমা

এই নথি **খালি স্টেজিং** পরিবেশের নকশা। এটি কোনো উৎপাদন কাটওভার, প্রকৃত আর্থিক ডেটা স্থানান্তর, Manus credential পুনঃব্যবহার, অথবা দীর্ঘমেয়াদি বিনা-মূল্যের নিশ্চয়তা নয়। বর্তমান Manus live endpoint ও GitHub Pages redirect অপরিবর্তিত থাকবে, যতক্ষণ না নতুন প্রোভাইডার-নিরপেক্ষ authentication, database, storage এবং scheduler সীমা আলাদাভাবে পরীক্ষা করা হয়।

নির্বাচিত স্টেজিং সংমিশ্রণ হলো **TiDB Cloud Starter + Google OAuth Web Application + private Vercel Blob**। Cloudflare R2 উপলভ্য ছিল না। Google Cloud Storage-কে কেবল বিকল্প হিসেবে গবেষণা করা হয়েছিল; সেটি নির্বাচিত বা কনফিগার করা হয়নি।

| স্তর | অনুমোদিত স্টেজিং সেবা | যাচাইকৃত অবস্থা | আবশ্যিক সুরক্ষা সীমা |
|---|---|---|---|
| Database | TiDB Cloud Starter | ব্যবহারকারী স্টেজিং account/cluster তৈরি সম্পন্ন বলেছেন। TiDB Starter/Essential সংযোগ MySQL-native এবং TLS-নির্ভর। [1] | `DATABASE_URL` কেবল Preview-তে যাবে; database খালি থাকবে এবং user অনুমতি ছাড়া কোনো schema বা বাস্তব ডেটা প্রয়োগ হবে না। |
| Sign-in | Google OAuth 2.0 Web application | ব্যবহারকারী staging client তৈরি সম্পন্ন বলেছেন। Google server-side flow confidential client ও exact registered redirect URI চায়। [2] | কেবল `openid`, `email`, `profile`; secret কেবল Vercel server environment-এ থাকবে। |
| Object storage | Private Vercel Blob | `amar-hisab-staging-backups` private store `sin1`-এ তৈরি; শুধু Development ও Preview-তে সংযুক্ত; কোনো finance data আপলোড করা হয়নি। | Browser, Git, chat, public URL বা `VITE_` variable-এ token যাবে না। |
| Scheduler | কোনো নতুন Vercel scheduler এখনো নির্বাচিত নয় | বর্তমান live Manus heartbeat চলছে। Vercel Cron production deployment-এ UTC অনুযায়ী `GET` পাঠায়। [3] | বিনা অনুমতিতে per-user/exact-time schedule-কে daily sweep-এ নামানো যাবে না। |

## TiDB database boundary

বর্তমান Drizzle schema ও accounting queries MySQL-compatible। TiDB-এর MySQL-native TCP সংযোগ বর্তমান data model পরীক্ষা করার উপযোগী; তবে Vercel function deployment-এর সাথে connection behavior এবং TLS connection string অবশ্যই খালি Preview database-এ পরীক্ষা করতে হবে। [1] Internal numeric `users.id`, `finance_projects.userId`, এবং প্রতিটি finance row-এর `(userId, projectId)` isolation অপরিবর্তিত থাকবে।

কোনো বাস্তব backup dump, Manus `DATABASE_URL`, বা current user identity TiDB staging-এ যাবে না। ভবিষ্যৎ production migration-এর জন্য encrypted export, checksum, foreign-key integrity validation, restore rehearsal, এবং verified identity mapping-এর আলাদা লিখিত অনুমোদন প্রয়োজন।

## Google OAuth boundary

Google OAuth server-side authorization-code flow এমন application-এর জন্য যেখানে secret নিরাপদে রাখা যায় এবং state ধরে রাখা যায়। [2] তাই provider-neutral adapter নিম্নলিখিত বৈশিষ্ট্য ছাড়া লেখা যাবে না: PKCE, state, nonce, exact callback allowlist, issuer/audience/expiry validation, secure HTTP-only signed session cookie, এবং stable `google:<sub>` identity mapping। Email household invitation মিলানোর কাজে ব্যবহৃত হতে পারে, কিন্তু authentication identity-এর একমাত্র প্রমাণ নয়।

বর্তমান Manus callback হলো `/api/oauth/callback`। Google staging mode-এর জন্য আলাদা canonical callback হবে **`/api/auth/google/callback`**। এটি Manus callback-কে প্রতিস্থাপন করবে না; `AUTH_MODE=google` না হলে পুরোনো Manus flow অপরিবর্তিত থাকবে। Google Console-এ redirect URI কেবল নির্ধারিত Google-staging Preview origin-এর সঙ্গে এই path জুড়ে নিবন্ধন করতে হবে; Preview URL নিশ্চিত হওয়ার আগে কোনো production alias বা Manus URL allowlist করা যাবে না। Google-এর নিয়ম অনুযায়ী redirect URI-টি নিবন্ধিত URI-এর সঙ্গে হুবহু মিলতে হবে। [5]

### Google staging authentication architecture

Google mode কেবল খালি staging environment-এর জন্য হবে এবং `AUTH_MODE=google` দ্বারা সচল হবে। অনুপস্থিত বা `manus` mode বর্তমান live fallback-এর বিদ্যমান Manus endpoint, callback এবং session flow ব্যবহার করবে। Browser-side mode flag (`VITE_AUTH_MODE=google`) কোনো secret নয়; এটি browser-কে কেবল `/api/auth/google/login` route-এ পাঠায়। Client ID, client secret, PKCE verifier, state, nonce এবং session secret কখনো `VITE_` variable, HTML, source control, log বা chat-এ যাবে না।

| ধাপ | Google staging mode-এর বাধ্যতামূলক নিয়ম |
|---|---|
| Login শুরু | Server 256-bit random `state`, `nonce` এবং PKCE verifier তৈরি করবে; verifier, state ও nonce কেবল short-lived host-only HTTP-only cookie-এ থাকবে। Browser কোনো provider secret তৈরি বা ধরে রাখবে না। |
| Authorization request | `openid email profile`, authorization-code response, `state`, `nonce`, PKCE `S256`, এবং fixed configured redirect URI ব্যবহার করবে। Google server flow state CSRF guard ও nonce replay protection চায়। [5] |
| Callback | Cookie-এর state constant-time match না হলে code exchange-এর আগেই fail closed হবে। Callback one-time cookie মুছে দেবে এবং user-controlled return URL গ্রহণ করবে না। |
| Token/identity validation | Server Google discovery/JWKS ব্যবহার করে ID token signature, issuer, audience (এই client ID), expiry এবং nonce যাচাই করবে। Internal principal হবে immutable `google:<sub>`; email কেবল verified profile/invitation matching-এর জন্য। Google server-side ID token validation আবশ্যক বলে। [6] |
| Application session | বর্তমান `jose`-signed first-party cookie format ব্যবহার হবে, কিন্তু Google mode-এ আলাদা `SESSION_SECRET` বাধ্যতামূলক; Manus `JWT_SECRET` পুনঃব্যবহার করা যাবে না। Finance procedures শুধু internal `users.id` পায়, ফলে accounting/project isolation provider token থেকে স্বাধীন থাকে। |
| Admin bootstrap | `ADMIN_BOOTSTRAP_EMAIL` কেবল verified Google email-এর প্রথম staging account-কে admin claim করতে পারে। এই allowlist পরে অপসারণ/বন্ধ করতে হবে; email কখনো principal key নয়। |

Google client secret নিরাপদে server-এ রাখার জন্য web-server flow উপযোগী এবং Google নিজেই pre-written server-side library ব্যবহার করার সুপারিশ করে। [5] বর্তমান dependency-তে ইতিমধ্যে `jose` আছে; অতএব নতুন broad Google API permission বা browser SDK না এনে discovery, PKCE এবং ID-token verification-এর জন্য সেই audited JWT primitive-ই ব্যবহার করা হবে। Drive scope, refresh token বা Google Drive file access এই sign-in design-এর অংশ নয়।

| Preview-only variable | উৎস | নিষেধাজ্ঞা |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth Web client | Git বা chat-এ secret হিসেবে লিখতে হবে না, তবে browser/client-এ কেবল প্রয়োজন হলে প্রকাশ করা যাবে। |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth Web client | Server-only; Vercel Preview environment ছাড়া কোথাও নয়। |
| `GOOGLE_OAUTH_REDIRECT_URI` | Implemented canonical callback | Google Console allowlist-এর সাথে byte-for-byte মিলতে হবে। |
| `SESSION_SECRET` | নতুন random secret | Manus `JWT_SECRET` পুনঃব্যবহার করা যাবে না। |
| `ADMIN_BOOTSTRAP_EMAIL` | যাচাইকৃত owner email | One-time staged admin-claim guard; claim-এর পরে বন্ধ করতে হবে। |

## Private Vercel Blob boundary

Vercel-এর মতে private Blob store-এ read access authenticated এবং private objects application Function-এর মাধ্যমে deliver করা হয়; public store-এ direct URL যে কেউ ব্যবহার করতে পারে। Store access mode সৃষ্টি হওয়ার পরে বদলানো যায় না। [4] Finance backup, export এবং user-owned document-এর জন্য তাই private store-ই বাধ্যতামূলক।

এই প্রকল্পে Vercel CLI-দিয়ে private store তৈরি করার পরে Preview/Development runtime-এ `BLOB_READ_WRITE_TOKEN` পাওয়া গেছে। Official guidance অনুযায়ী project-linked store সাধারণত OIDC-ও ব্যবহার করতে পারে, তবে এই runtime contract-এ `BLOB_STORE_ID` এবং `VERCEL_OIDC_TOKEN` দেখা যায়নি। [4] Adapter কেবল runtime `BLOB_READ_WRITE_TOKEN` ব্যবহার করে; token log, source, test fixture, browser response বা chat-এ প্রকাশ করে না। Token অনুপস্থিত কিন্তু Blob store configured হলে adapter Forge-এ fallback না করে fail closed করে।

### Download authorization rule

Opaque Blob key কোনো authorization credential নয়। Vercel Blob branch সক্রিয় থাকলে raw legacy `/manus-storage/<key>` path আর private object stream করে না। এর পরিবর্তে sensitive object-এর জন্য relational metadata থাকবে: owner user, ঠিক একটি scope (project owner বা household), object kind, content type, filename, size, created time এবং immutable storage key। Protected `/api/storage/objects/:id` endpoint session authenticate করে project ownership অথবা active household membership যাচাই করার পরে মাত্র object stream করতে পারে।

| অবস্থা | ফলাফল |
|---|---|
| Unknown object, malformed scope, অন্য tenant, inactive household member | কোনো file নয়; object-existence leakage কমাতে not-found response। |
| Project-scoped export | শুধু metadata owner এবং উল্লেখিত project-এর owner। |
| Household-scoped export | active household member download করতে পারে; metadata create/update কেবল household owner/editor-এর মাধ্যমে হবে। |
| Raw Blob pathname | Vercel Blob branch-এ reject; pathname জানলেই download করা যায় না। |
| Existing Manus/Forge live runtime | পুরোনো Forge path কেবল legacy environment-এ থাকে; staging Blob credential অনুপস্থিত হলে Forge fallback হয় না। |

Private store এখনো খালি। কোনো finance backup/export flow এখনো metadata registration + upload-cleanup workflow দিয়ে Blob-এ লিখছে না। এটি ইচ্ছাকৃত: generated SQL migration প্রথমে review করা হয়েছে, কিন্তু কোনো TiDB database-এ apply করা হয়নি। Staging-only upload implementation, cleanup-on-registration-failure, tenant/household denial test, এবং empty preview validation শেষ না হওয়া পর্যন্ত Blob-এ সংবেদনশীল data রাখা যাবে না।

## Scheduler boundary

Vercel Cron production URL-এ `GET` পাঠায়, failed invocation স্বয়ংক্রিয়ভাবে retry করে না, এবং UTC cron expression ব্যবহার করে। [3] Hobby-level daily execution exact per-user bill reminder ও recurring timing-এর সমতুল্য নয়। নিরাপদ বিকল্প বেছে নেওয়ার অধিকার ব্যবহারকারীর: বর্তমান Manus scheduler রাখা, daily idempotent Vercel sweep গ্রহণ করা, অথবা paid precise scheduler নেওয়া। নতুন cron route, `CRON_SECRET`, অথবা scheduler downgrade এখনো যোগ করা হয়নি।

## অনুমোদন-পূর্ব Preview checklist

| ক্রম | কার্যক্রম | অনুমোদন/সীমা |
|---|---|---|
| 1 | Preview-only TiDB `DATABASE_URL` যোগ করা | ব্যবহারকারী Vercel dashboard-এ secret দেবেন; chat-এ নয়। |
| 2 | Canonical Google callback implement করা | তারপর user Google Console allowlist পরিবর্তন করবেন। |
| 3 | Provider mode switch ও isolated OAuth tests যোগ করা | Legacy Manus live path ভাঙা যাবে না। |
| 4 | খালি TiDB-তে reviewed migration প্রয়োগ করা | Explicit user approval ছাড়া নয়। |
| 5 | Blank profile-এ authenticated preview test | কোনো বাস্তব finance data, backup বা object ব্যবহার নয়। |
| 6 | Scheduler policy নির্বাচন | Free daily sweep কোনো implicit replacement হতে পারবে না। |

## References

[1]: https://docs.pingcap.com/tidbcloud/connect-to-tidb-cluster-serverless/ "Connect to Your TiDB Cloud Starter or Essential Instance"
[2]: https://developers.google.com/identity/protocols/oauth2/web-server "Using OAuth 2.0 for Web Server Applications"
[3]: https://vercel.com/docs/cron-jobs "Vercel Cron Jobs"
[4]: https://vercel.com/docs/vercel-blob "Vercel Blob"
[5]: https://developers.google.com/identity/protocols/oauth2/web-server "Using OAuth 2.0 for Web Server Applications"
[6]: https://developers.google.com/identity/openid-connect/openid-connect "OpenID Connect | Sign in with Google"
