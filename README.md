# 💰 Elite Money Tracker (Ultimate Version)

A professional personal finance management system designed for **GitHub Pages**.

## 🏗️ Architecture
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (ES6 Modules)
- **Database**: Firebase Firestore (Real-time)
- **Authentication**: Firebase Auth (Google Sign-In)
- **Hosting**: GitHub Pages (via GitHub Actions)

## 🚀 Professional Features

1.  **Multi-User Support**: Data is now private and secure. Log in with Google to manage your own personal records.
2.  **Financial Health Score**: Real-time 0-100 score based on savings rate and budget compliance.
3.  **Floating Action Button (FAB)**: Mobile-first quick entry for transactions.
4.  **Expense Breakdown (Pie Chart)**: Visual analysis of where your money goes, categorized by expense types.
5.  **Offline-First (PWA)**: Enhanced Service Worker with Stale-While-Revalidate caching for maximum reliability.
6.  **Real-time Search**: Quickly find any transaction in the Reports section.
7.  **Dark Mode**: A beautiful, eye-friendly theme with glassmorphism effects.
8.  **Data Portability**: Export to **PDF**, **Excel**, or a full **JSON Backup**.

## 🏗️ Architecture: The "Dual-Core" Strategy

This project maintains two synchronized versions to ensure 10-year longevity:

-   **Ultimate Version (Root)**: The primary, low-dependency PWA using Vanilla JS and Firebase. Best for rapid mobile use and maximum uptime.
-   **Standard Version (`/Money_Tracker`)**: A robust React + Flask stack using Supabase. Ideal for complex management and advanced analytics.

**Unified Data Hub**: Both versions share a compatible JSON schema, allowing you to migrate your data between Firebase and Supabase at any time via the **Migration Hub**.

## 🛠️ Setup Instructions

### 1. Firebase Configuration
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** and **Authentication** (Google Provider).
3. Create a Web App and copy the `firebaseConfig` object.
4. Paste your configuration into `firebase-config.js`.

### 2. Firestore Security Rules (Production)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // Allow read/write only if the user is authenticated and owns the data
      allow read, write: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }
    match /accounts/{id} {
        allow read, write: if request.auth != null && (resource == null || resource.data.userId == request.auth.uid);
    }
    // Apply similar rules to all collections
  }
}
```

### 3. Local Development
```bash
python3 -m http.server 8000
```
Visit `http://localhost:8000`.

## 🔐 Authentication
- **Primary**: Login with Google.
- **Legacy**: Master Password (`Rossy01`) - uses a shared 'master_user' ID.

## 🚢 Deployment
Every push to the `main` branch automatically deploys the latest version to your GitHub Pages site.
