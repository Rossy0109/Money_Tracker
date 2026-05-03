# 💰 Elite Money Tracker (Ultimate Version)

A professional personal finance management system designed for **GitHub Pages**.

## 🏗️ Architecture
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (ES6 Modules)
- **Database**: Firebase Firestore (Real-time)
- **Authentication**: Firebase Auth (Google Sign-In)
- **Hosting**: GitHub Pages (via GitHub Actions)

## 🚀 Professional Features

1.  **Multi-User Support**: Data is now private and secure. Log in with Google to manage your own personal records.
2.  **Expense Breakdown (Pie Chart)**: Visual analysis of where your money goes, categorized by expense types.
3.  **Real-time Search**: Quickly find any transaction in the Reports section by searching for descriptions or categories.
4.  **Dark Mode**: A beautiful, eye-friendly theme that persists across sessions.
5.  **Data Portability**: Export your data to **PDF**, **Excel**, or a full **JSON Backup**.

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
