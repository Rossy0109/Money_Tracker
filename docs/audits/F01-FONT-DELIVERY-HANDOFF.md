# F-01: Bengali Font Delivery — Specialist Handoff

**Agent**: Agent 2 — Frontend and Asset Specialist (LongCat 2.5)  
**Date**: 2026-10-16  
**Status**: Fix APPLIED and validated 2026-10-17 (vercel.json `|fonts/` exclusion + `.gitignore` `/public/`) — see PRODUCTION-DEEP-AUDIT.md; live-Vercel confirmation pending owner deployment

---

## Finding

`GET /fonts/NotoSansBengali-Variable.woff2` returns HTTP 200 with `Content-Type: text/html` (the SPA index.html) instead of the WOFF2 binary.

## Root Cause

The `vercel.json` catch-all rewrite rule rewrites **all** non-API requests to `/index.html`:

```json
"rewrites": [
  {
    "source": "/((?!api/).*)",
    "destination": "/index.html"
  }
]
```

This includes `/fonts/*` requests. Vercel's routing layer intercepts font requests before they reach the Express `serveStatic` middleware, returning the HTML file instead.

## Affected Paths

| Path | Expected | Actual |
|------|----------|--------|
| `/fonts/NotoSansBengali-Variable.woff2` | `font/woff2` binary | `text/html` (index.html) |
| `/fonts/NotoSansBengali-Regular.ttf` (PDF) | `font/ttf` binary | `text/html` (index.html) |

The TTF font is fetched by `window.fetch()` in 6 PDF generation modules:
- `client/src/lib/print/voucherPdf.ts`
- `client/src/lib/print/statementPdf.ts`
- `client/src/lib/monthlyReportPdf.ts`
- `client/src/lib/auditLogExports.ts`
- `client/src/lib/householdChartExport.ts`
- `client/src/pages/PartyLedger.tsx`

## Proposed Fix (Requires Coordinator Approval)

**File**: `vercel.json`  
**Change**: Add `|fonts/` to the negative lookahead in the rewrite source:

```json
"rewrites": [
  {
    "source": "/((?!api/|fonts/).*)",
    "destination": "/index.html"
  }
]
```

This is the smallest safe correction — it only excludes font asset paths from the SPA rewrite while preserving all other routing behavior.

## Regression Tests Added

**File**: `server/font-delivery.test.ts` (18 tests)

| Test | Status | Notes |
|------|--------|-------|
| Variable font source exists | PASS | `client/public/fonts/NotoSansBengali-Variable.woff2` |
| Variable font in dist | PASS | `dist/public/fonts/` |
| Variable font in public | PASS | `public/fonts/` (Vercel output) |
| WOFF2 magic bytes | PASS | `wOF2` header |
| Font file non-empty | PASS | 107,720 bytes |
| Preload link references variable font | PASS | `href="/fonts/NotoSansBengali-Variable.woff2"` |
| @font-face uses weight range 100-900 | PASS | `font-weight: 100 900` |
| @font-face src references variable font | PASS | `src: url("/fonts/NotoSansBengali-Variable.woff2")` |
| No static font references | PASS | No Regular/SemiBold/Bold WOFF2 refs |
| Vercel rewrite excludes /fonts/ | **FAIL** | Currently rewrites font URLs to index.html |
| Font URL does NOT match rewrite | **FAIL** | Confirms bug: font URL matches rewrite |
| SPA route matches rewrite | PASS | `/dashboard` → `/index.html` |
| API route does NOT match rewrite | PASS | `/api/trpc` excluded |
| Vite publicDir is client/public | PASS | Source file check |
| Font file integrity (source == dist) | PASS | Byte-identical |
| Font file size > 10KB | PASS | 107,720 bytes |

The 2 failing tests correctly detect the bug and will pass once the `vercel.json` fix is applied.

## Verification Evidence

```bash
# Font file exists and is valid WOFF2
$ file client/public/fonts/NotoSansBengali-Variable.woff2
Web Open Font Format (Version 2), TrueType, length 107720, version 1.0

# Font file is copied to build output
$ ls dist/public/fonts/NotoSansBengali-Variable.woff2
dist/public/fonts/NotoSansBengali-Variable.woff2

# Font file is copied to Vercel output
$ ls public/fonts/NotoSansBengali-Variable.woff2
public/fonts/NotoSansBengali-Variable.woff2

# Rewrite rule currently does NOT exclude fonts
$ grep -A2 'rewrites' vercel.json
"rewrites": [
  {
    "source": "/((?!api/).*)",
    "destination": "/index.html"
  }
]
```

## Recommendation

**Apply the one-line fix to `vercel.json`** — add `|fonts/` to the rewrite exclusion. This is a deployment config change requiring Coordinator approval.
