# 💰 Money Record Book (Ultimate Version)

A professional personal finance management system designed for **GitHub Pages**.

## 🏗️ Architecture
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (ES6 Modules)
- **Database**: Firebase Firestore (Real-time)
- **Authentication**: Firebase Auth (Google Sign-In)
- **Hosting**: GitHub Pages (via GitHub Actions)

## 🚀 Mathematical & Financial Features

1.  **Financial Lab**: Advanced analytical tools for deep financial insights.
    - **Financial Runway**: Calculates how many months your savings will last.
    - **Burn Rate Analysis**: Shows your average monthly spending power.
    - **Wealth Simulator**: Interactive compound interest growth projection.
    - **Debt Payoff Lab**: Tracks net debt and estimated clearance timelines.
2.  **Multi-User Support**: Data is private and secure via Firebase Auth.
3.  **Financial Health Score**: Real-time 0-100 score based on savings and budget compliance.
4.  **Floating Action Button (FAB)**: Mobile-first quick entry for transactions.
5.  **Offline-First (PWA)**: Enhanced Service Worker with Stale-While-Revalidate caching.
6.  **Dark Mode**: Professional, eye-friendly theme with glassmorphism effects.
7.  **Data Portability**: Export to **PDF**, **Excel**, or a full **JSON Backup**.

## 🏗️ Architecture: The "Dual-Core" Strategy

This project maintains two synchronized versions:

-   **Ultimate Version (Root)**: The primary, low-dependency PWA using Vanilla JS and Firebase. Best for rapid mobile use and maximum uptime.
-   **Standard Version (`/Money_Tracker`)**: A robust React + Flask stack using Supabase. Ideal for complex management.

**Unified Data Hub**: Both versions share a compatible JSON schema via the **Migration Hub**.

## 🛠️ Setup Instructions

### 1. Firebase Configuration
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** and **Authentication** (Google Provider).
3. Create a Web App and copy the `firebaseConfig` object into `firebase-config.js`.

### 2. Local Development
```bash
python3 -m http.server 8000
```
Visit `http://localhost:8000`.

## 🔐 Copyright
**Copyright Reserved: Md Kamrul Ahmed**

## 🚢 Deployment
Every push to the `main` branch automatically deploys the latest version to your GitHub Pages site.
