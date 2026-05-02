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

## 🚢 Deployment
- Any push to `main` triggers a Playwright test suite followed by deployment to the `gh-pages` branch.
