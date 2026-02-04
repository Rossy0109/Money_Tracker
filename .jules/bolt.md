## 2026-02-04 - Local Calculation in Summary Component
**Learning:** Moving summary calculations from the backend to the frontend using `useMemo` and an existing `transactions` prop eliminates redundant API calls and ensures instant UI updates. This is efficient as long as the dataset size (N) is manageable (O(N) loop on client).
**Action:** Always check if data for summary/statistics is already available in the parent component's state before creating new API endpoints.

## 2026-02-04 - SQLite Thread Safety in Flask
**Learning:** Sharing a single `sqlite3` cursor across Flask requests (even with `check_same_thread=False`) leads to "Recursive use of cursors not allowed" errors or segmentation faults when concurrent requests occur (e.g., React mounting and making multiple calls).
**Action:** Always create a new cursor via `conn.cursor()` within each Flask route handler to ensure thread safety.

## 2026-02-04 - CORS Preflight Authentication
**Learning:** Flask `before_request` hooks that enforce authentication can block CORS preflight (`OPTIONS`) requests, returning 401 and causing subsequent `POST/PUT/DELETE` requests to fail in the browser.
**Action:** Explicitly allow `OPTIONS` requests in the `before_request` hook: `if request.method == 'OPTIONS': return`.
