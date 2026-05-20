# LONG_TERM_MAINTENANCE.md

## Folder Structure
```
/
├── .github/workflows/    # CI/CD & Automated Backups
├── assets/               # Icons, Logos
├── backups/              # Automated JSON Snapshots
├── app.js                # Core Business Logic (Keep Vanilla)
├── style.css             # UI Styling (Keep Vanilla)
├── index.html            # Main Entry Point
└── supabase_schema.sql   # Database Source of Truth
```

## Conventions
- **Naming:** Use `snake_case` for database columns and `camelCase` for JS variables.
- **Logic:** Decouple formulas (e.g., Zakat, EMI) into standalone JS functions to ensure they can be reused in future versions.
- **Versioning:** Tag your GitHub releases (e.g., `v1.2.0`) for every major feature set.

## Scaling (7-10 Years)
- **Database:** Supabase handles up to 500MB on the free tier. At 1 transaction/day, this will last for decades.
- **Code:** By avoiding React/Angular, you avoid the "depreciation treadmill." Native JS/CSS is the only way to ensure the app works in the browsers of 2035.
