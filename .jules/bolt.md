## 2026-02-02 - Redundant Summary API Calls
**Learning:** The React frontend was fetching daily and weekly summaries via separate API calls, even though it already had the full transactions list. This caused unnecessary network overhead (2 extra requests on every mount). Moving the calculation to the frontend using `useMemo` and proper local date logic (matching SQLite's YYYY-MM-DD) eliminates these calls.
**Action:** Always check if summary data can be derived from existing state/props before adding new API endpoints or calls.

## 2026-02-02 - Python Segfaults with SQLite (Observation)
**Learning:** Concurrent access to a single SQLite connection/cursor in a Flask app can cause segmentation faults. The memory's suggestion to use a new cursor per request is critical for stability. Although not fixed in the current performance PR to maintain focus, it's a critical learning for future backend stability tasks.
**Action:** In Flask/Python apps using SQLite, ensure connection/cursor management is thread-safe or per-request.
