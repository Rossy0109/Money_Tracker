## 2026-01-31 - [Robust Local Date Calculation in JS]
**Learning:** Using `toLocaleDateString('en-CA')` to get a YYYY-MM-DD date string is brittle and can depend on the environment's locale settings. A more robust way to get the local YYYY-MM-DD string is to adjust the date by the timezone offset and then use `toISOString().split('T')[0]`.
**Action:** Use `new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0]` for reliable local date strings in a format compatible with SQLite.
