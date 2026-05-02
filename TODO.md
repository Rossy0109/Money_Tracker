# 📋 Money Tracker - Remaining Manual Steps (TODO)

To fully activate the "Ultimate Version" of the Elite Money Tracker, please complete these systematic steps:

## 1. Firebase API Configuration
In **`firebase-config.js`**, replace the placeholders with your actual keys from the [Firebase Console](https://console.firebase.google.com/):
- [ ] `apiKey`
- [ ] `authDomain`
- [ ] `projectId`
- [ ] `storageBucket`
- [ ] `messagingSenderId`
- [ ] `appId`

## 2. Firebase Security Rules
In the **Firestore > Rules** tab, apply the following professional security configuration:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null && (resource == null || resource.data.userId == request.auth.uid);
    }
  }
}
```

## 3. Sentry Error Tracking (Optional)
In **`app.js`** (Line 36), update your Sentry DSN if you wish to track production errors:
- [ ] `dsn: "YOUR_SENTRY_DSN"`

## 4. GitHub Secret
If you wish to keep the automated deployment active:
- [ ] Ensure your GitHub Repository has a `GITHUB_TOKEN` (provided automatically by Actions) or a custom personal access token with `repo` scope if deploying to a different organization.

---
*Generated systematically by Gemini CLI on 2026-05-02.*
