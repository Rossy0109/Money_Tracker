# Money Tracker Project Mandates

This document establishes the software engineering standards and architectural patterns for the Money Tracker project.

## 🏗️ Architecture
- **Ultimate Version (Root)**: Primary PWA using HTML/Vanilla JS/Firebase. Deployed to GitHub Pages.
- **Standard Version (`/Money_Tracker`)**: Legacy/Reference version using React/Flask/Supabase.
- **Data Layer**: Powered by Firebase Firestore for real-time updates and persistence.

## 🛠️ Standards
- **Automation First**: All deployments must be automated via GitHub Actions (`.github/workflows/deploy.yml`).
- **Test-Driven**: Changes to the root project must be verified with Playwright E2E tests in `tests/`.
- **Systematic Structure**: Keep the root clean. Business logic should reside in `app.js`. Configuration should reside in `firebase-config.js`.
- **Professional UX**: Maintain the "Ultimate" aesthetic with Dark Mode support and real-time feedback.

## 🛡️ Longevity & Sustainability (10-Year Vision)
- **Standard-First**: Prioritize native Web APIs (ES6+, CSS Grid/Flexbox) over third-party libraries to minimize breaking changes from dependency updates.
- **Vendor Agnostic**: Keep the core logic in `app.js` decoupled from the Firebase SDK. If a database migration is needed in the future, only the `Data Hub` section should require modification.
- **Data Sovereignty**: The JSON backup feature must always capture the *entire* state. Users must never be locked into a single platform.
- **Interconnect Strength**: 
    - The `/Money_Tracker` (Standard) and root (Ultimate) versions should share the same data schema logic to allow for easy migration between stacks.
    - **Migration Path**: The root project's "JSON Backup" captures the full state including schema version. The legacy React version should be updated to accept this format for cross-version compatibility.
    - **Offline-First**: Persistence must be enabled in both versions to ensure the "7-10 year" reliability mandate is met even with intermittent connectivity.
