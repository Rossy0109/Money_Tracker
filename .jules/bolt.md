# Bolt's Journal - Performance Learning Log ⚡

## 2025-05-15 - Redundant API Calls vs. Local Computation
**Learning:** In a React application where a parent component already manages the source of truth (e.g., a list of transactions), child components that display summaries or statistics should avoid making independent API calls to fetch that same data. Independent calls lead to redundant network traffic, inconsistent UI (if the child doesn't update when the parent's data changes), and slower initial loads.
**Action:** Always check if the required data for a summary/stat component is already available in the parent or global state. Use `useMemo` to perform derived calculations locally, ensuring the UI stays in sync and the network is used efficiently.
