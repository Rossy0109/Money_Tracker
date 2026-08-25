# Vercel-Compatible Provider Migration Research

## TiDB Cloud Starter as a staging database candidate

The current finance schema and Drizzle configuration use a MySQL-compatible dialect. TiDB Cloud Starter is therefore a candidate for an **empty staging environment**, because TiDB documents MySQL native TCP connections, TLS requirements for Starter/Essential public endpoints, and a Vercel integration that can inject project environment variables. This is a research finding only; no user finance data, connection string, or provider credential has been moved.

| Decision area | Official finding | Migration implication |
|---|---|---|
| SQL compatibility | TiDB Cloud supports direct connections through MySQL-native TCP clients. | The current MySQL-oriented Drizzle logic can be evaluated without changing accounting queries first. |
| Network security | Starter and Essential direct connections require TLS. | The Vercel database URL must enforce provider-approved TLS settings. |
| Vercel linkage | The TiDB Cloud integration can add connection environment variables to a selected Vercel project and supports per-Git-branch database branching. | A blank staging cluster/branch can isolate preview verification from production finance data. |
| Free quota | The published Starter pricing page states a monthly free quota for qualifying instances, with finite storage and request-unit limits. | This supports limited staging trials but is not a ten-year availability or no-cost guarantee. A usage/spending guard and backup plan remain required. |

## Sources

1. [Connect to Your TiDB Cloud Starter or Essential Instance](https://docs.pingcap.com/tidbcloud/connect-to-tidb-cluster-serverless/) — MySQL-native connections, TLS, and serverless connection methods.
2. [Integrate TiDB Cloud with Vercel](https://docs.pingcap.com/tidbcloud/integrate-tidbcloud-with-vercel/) — Vercel integration, environment injection, and branch-isolated deployments.
3. [TiDB Cloud Starter Pricing Details](https://www.pingcap.com/tidb-cloud-starter-pricing-details/) — published free quota, resource limits, and spending-limit behavior.

## Google OAuth replacement boundary

Google documents the web-server OAuth authorization-code flow for applications that can securely retain a confidential client secret and state. A new OAuth client must be a **Web application** and must explicitly register the Vercel callback URI. The Google client secret is visible only at creation time and must not be committed, copied to GitHub, or sent in chat.

| Required design control | Migration decision |
|---|---|
| Callback allowlist | Register `https://amar-hisab-money-tracker.vercel.app/api/oauth/callback` only after the new server-side callback implementation exists. |
| Minimal identity scope | Use OpenID Connect identity scopes needed for sign-in and profile identity; do not request Drive or unrelated Google API scopes for finance login. |
| Server-side secret | Retain `GOOGLE_CLIENT_SECRET` only in Vercel Production/Preview secrets, never in `VITE_` variables or source control. |
| Account identity | Map Google `sub` to a provider-neutral external identity field and preserve the existing user/project authorization model. Do not guess or copy a Manus `openId`. |
| Session integrity | Retain state/nonce validation, HTTPS-only httpOnly signed session cookies, fixed callback origin, and logout invalidation. |

Sources: [Google OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) and [Google Cloud: Manage OAuth Clients](https://support.google.com/cloud/answer/15549257?hl=en).

## Object-storage replacement boundary

Vercel Blob is a viable storage candidate because it can use a private store and server-side authenticated access when connected to the Vercel project. Finance backups, exports, and user-owned documents must use **private** storage. Public Blob URLs are not acceptable for backups or finance exports. Server-function uploads are limited to the provider's documented request-size limit; any larger user upload would need a separately authorized client-upload design.

| Required design control | Migration decision |
|---|---|
| Read visibility | Create a **private** Blob store; files must be served after the existing project/household authorization checks, never by a public URL. |
| Write authority | Use only the project-injected `BLOB_READ_WRITE_TOKEN` in the server runtime; never place it in source control, browser variables, or chat. |
| Object pathing | Use immutable, user/project-scoped keys and retain metadata in the relational database for authorization and auditability. |
| Migration safety | Do not move existing Manus objects automatically. Verify blank staging uploads/downloads first; production data export/import needs separate consent and inventory. |

Sources: [Vercel Blob](https://vercel.com/docs/vercel-blob), [Server Uploads with Vercel Blob](https://vercel.com/docs/vercel-blob/server-upload), and [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).

## Recurring finance automation replacement boundary

Vercel Cron sends an HTTP `GET` request only to the **production** deployment. The route must verify `Authorization: Bearer ${CRON_SECRET}` with a random secret stored only in Vercel environment settings. A failed invocation is not retried by the provider, and overlapping scheduled invocations can run concurrently; accounting writes therefore require both a database-level idempotency key and an explicit transaction/lock strategy.

| Constraint | Effect on this application |
|---|---|
| Vercel Hobby scheduling | A project can define up to 100 jobs, but each can run only **once per day**, with a documented execution window of up to ±59 minutes. Per-user bill reminders and recurring transaction schedules cannot be preserved with the former arbitrary per-user timing on Hobby. |
| Vercel Pro scheduling | Supports one-minute minimum interval and per-minute precision, but increases recurring service cost. |
| Request method | The scheduled route must support `GET` (not rely solely on the current POST-only Manus callback contract). |
| Request authentication | Require `CRON_SECRET`; do not accept browser sessions, user-supplied task identifiers, or unverified paths as proof of scheduler authority. |
| Duplicate prevention | Preserve the existing unique recurring run key and add transaction/locking checks around each daily sweep, because Vercel may invoke overlapping runs. |
| Failure behaviour | Log a non-sensitive failure audit entry and leave eligible work pending for the next sweep; do not mark a transaction or reminder complete before the database transaction succeeds. |

The safe free-tier design is one daily, project-level sweep for eligible recurring transactions and bill reminders, not one job per user or bill. Any requirement for exact-time or multiple daily reminders must remain on the currently working Manus deployment or move to a paid scheduler chosen explicitly by the user.

Sources: [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Existing application dependency audit

The business tables and accounting procedures remain MySQL-compatible. They do not depend on Manus types, and their essential privacy boundary is the database relationship between the internal numeric `users.id`, `finance_projects.userId`, and each finance row's `(userId, projectId)`. Household membership, invitations, shared budgets, audit logs, voucher sequencing, transaction atomicity, and restore transactions are likewise database-level logic; none may be rewritten as browser-side checks during migration.

| Boundary | Current implementation | Migration-safe replacement rule |
|---|---|---|
| User identity | `users.openId` is unique and receives a Manus `openId`; the first upsert assigns administrator role only when it matches `OWNER_OPEN_ID`. | Introduce a provider-neutral identity adapter which stores a stable Google subject as a namespaced external subject, e.g. `google:<sub>`. Keep internal `users.id` as the only foreign-key identity. Do not infer identity from email alone. |
| Session | Manus SDK validates bearer/session state and signs the application session. | Server-side Google authorization-code flow with PKCE/state/nonce validation, then a signed, secure, HTTP-only local session cookie using a user-owned `JWT_SECRET`. The callback must verify issuer, audience, expiry, and nonce before upsert. |
| First administrator | Configured with Manus owner `openId`. | Create a one-time, environment-gated bootstrap administrator email/subject flow. The bootstrap control must be removed or disabled after the verified owner claims the account. |
| Database | Drizzle + MySQL/TiDB-compatible tables. | Apply schema only to an empty user-owned staging TiDB/MySQL database first. Production data transfer requires a separately approved encrypted export, checksum, referential-integrity validation, and a documented identity map. |
| File storage | Server asks Manus Forge for presigned S3 URLs; `/manus-storage/*` redirects to the resulting signed URL. | Retain the narrow `storagePut/storageGetSignedUrl` server interface, but implement it with a user-owned object store. The storage key must remain server-generated, namespaced, and authorization-checked before every signed download. |
| Scheduler | Manus heartbeat creates per-user/per-record authenticated POST callbacks using an SDK-issued cron identity. | A single Vercel `GET` cron sweep plus `CRON_SECRET` on a user-owned database. Do not expose current user-selected scheduler paths externally. Preserve idempotency within one database transaction. |
| Optional Manus capabilities | Image generation, maps, transcription, and data proxy read Forge credentials. | Exclude from the first Vercel finance cutover or replace each through a separately approved provider. They are not required for core accounting, but their menus/routes must fail closed rather than expose dead controls. |

### Data and identity migration guardrails

The pending Vercel staging deployment must start **empty**. It must not connect to the Manus database, import a database dump, copy a Forge key, or use the existing Manus user identifier as a login credential. A later production migration must map every existing internal `users.id` to the verified new identity before importing dependent finance and household rows. Email normalization is valid for household invitation matching only; it is not sufficient proof that two authentication identities are the same account.

## Recommended user-owned staging architecture

For the initial empty staging environment, the recommended combination is **TiDB Cloud Starter + Google OAuth web application + Cloudflare R2**. This retains the current MySQL/Drizzle query surface and uses vendors that the account holder can administer independently of Manus. It is a migration recommendation, not a guarantee that any free tier will remain available for ten years; limits, billing, retention, and provider terms must be reviewed periodically.

| Layer | Recommended service | Why it fits this application | Operational caveat |
|---|---|---|---|
| Database | TiDB Cloud Starter | It is MySQL-compatible, supports TLS on Starter/Essential connections, exposes a direct SQL/ORM connection path, and its current Starter tier advertises 25 GiB row storage, 25 GiB column storage, and 250M RUs free per organization per month. | Starter must be treated as an empty staging target until backups, recovery testing, budget limits, and owner access have been confirmed. The documented Essential tier offers point-in-time backup and 30-day retention, but its stated typical small-production price is about USD 20/day. |
| Authentication | Google OAuth 2.0 web-server authorization-code flow | Google documents this flow for confidential web-server applications. A Vercel function can keep the client secret server-side and use the registered callback route. | Request only `openid`, `email`, and `profile`. Store the client-secret only in Vercel. Google requires an exact registered redirect URI and cautions that the secret cannot be retrieved again after creation. |
| Private export/backup object storage | Cloudflare R2 Standard via S3-compatible API | R2 exposes an S3 API and current free allowance of 10 GB-month, 1M Class-A operations, 10M Class-B operations, and zero direct egress. Existing server-side storage can be adapted without exposing a public bucket. | Use a private bucket, server-side signed URLs, an account-scoped S3 endpoint, and lifecycle/backup policy. Do not make financial exports public. Free allowance and pricing can change. |
| Scheduled finance sweep | Vercel Cron `GET /api/cron/daily` guarded by `CRON_SECRET` | Vercel invokes production cron routes with `GET`, and recommends a random `CRON_SECRET` checked against the Bearer Authorization header. One daily sweep can find due recurring templates and bill reminders. | Vercel does not retry failed cron invocations. The handler needs an idempotency transaction/lock and durable audit/error output. It cannot retain the current per-user Manus callback identity model. |

> “Vercel will not retry an invocation if a cron job fails.” — Vercel Cron management documentation. The migration therefore needs a durable processing ledger and manual retry/admin visibility instead of assuming the provider retries work. [5]

### Required configuration names for the recommended design

The proposed provider-neutral application should replace the current Manus-only values with `DATABASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, and `CRON_SECRET`. Each value is production-only in Vercel; preview must use a separately created empty database and bucket. No production credential, legacy value, database record, or identity is copied into preview.

## References

[1]: https://www.pingcap.com/pricing/ "TiDB Cloud pricing"
[2]: https://docs.pingcap.com/tidbcloud/connect-to-tidb-cluster-serverless/ "Connect to TiDB Cloud Starter or Essential"
[3]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"
[4]: https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 pricing"
[5]: https://vercel.com/docs/cron-jobs/manage-cron-jobs "Managing Vercel Cron Jobs"
[6]: https://vercel.com/docs/cron-jobs "Vercel Cron Jobs"
[7]: https://developers.cloudflare.com/r2/api/s3/api/ "Cloudflare R2 S3 API compatibility"
[8]: https://vercel.com/docs/vercel-blob/usage-and-pricing "Vercel Blob pricing"

## Revised private-storage staging decision

Cloudflare R2 is unavailable to the account holder, and the isolated `amar-hisab-money-tracker` Vercel project’s Stores page did not offer a Blob store. Neither provider will be configured or receive finance data. The practical replacement is a **private Google Cloud Storage bucket** in the already-created Google Cloud staging project, with Uniform bucket-level access and a narrowly scoped runtime identity. Google documents a monthly always-free Cloud Storage allowance of 5 GiB standard storage, 55,000 operations, and 100 GiB data transfer; this is a current quota rather than a ten-year price guarantee. [9]

| Control | Revised staging decision |
|---|---|
| Bucket visibility | Keep the bucket private; do not enable public access, anonymous object listing, public URL downloads, or website hosting. |
| Runtime identity | Prefer Vercel-to-GCP Workload Identity Federation so the deployed Vercel project obtains short-lived credentials. Do not store a long-lived Google service-account key in GitHub, client variables, or chat. |
| Minimum permission | Grant object create/read/delete only for the staging bucket, not project-wide Storage Admin. Application reads must continue through server-side authorization and short-lived signed URLs. |
| Object protection | Use project/user-scoped generated names, metadata in the relational database, versioning/soft-delete or retention only after reviewing the cost and recovery effect, and lifecycle rules for disposable staging artifacts. |
| Scope | The bucket starts empty and receives only generated staging backups/exports after provider-neutral code is implemented. No Manus object, key, or real finance record is copied. |

The current official Vercel-to-GCP OIDC guide describes configuring a GCP Workload Identity Pool, a Vercel OIDC provider, a Vercel project/environment-scoped principal, and the required non-secret GCP environment identifiers. [10] This is more secure than serializing a service-account private key into a Vercel variable, but it must be configured by the account holder in the Google Cloud project before the staging storage adapter is enabled.

[9]: https://cloud.google.com/storage "Google Cloud Storage"
[10]: https://vercel.com/docs/oidc/gcp "Connect to Google Cloud Platform (GCP)"

## Vercel Blob re-check

Vercel’s current documentation states that Blob is available on all plans and that stores can be created and managed from either the account dashboard or the Vercel CLI. Private Blob storage is suitable for sensitive exports because every read requires authenticated access and should be streamed through an application function after the existing project and household authorization checks. [11] The verified staging store is connected through the Vercel-provided server environment contract `BLOB_READ_WRITE_TOKEN`. The token must be treated as a secret: it is passed only to server-side Blob SDK calls and is never committed, placed in a `VITE_` variable, or sent in chat.

The initial Stores-page absence was not evidence that the product was unavailable. The Vercel CLI confirmed the capability and created the private empty staging store `amar-hisab-staging-backups`, connected only to the `amar-hisab-money-tracker` development and preview environments. No finance data was uploaded. The adapter must retain server-side authorization checks and must not expose direct Blob URLs. [11]

[11]: https://vercel.com/docs/vercel-blob "Vercel Blob"
