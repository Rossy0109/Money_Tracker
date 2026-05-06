// firebase-admin.js - Server-side Firebase Admin initialization
// Expects FIREBASE_ADMIN_CREDENTIALS (base64-encoded service account JSON) in env.

import admin from 'firebase-admin';

let firebaseAdmin = null;

if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
  try {
    const decoded = Buffer.from(process.env.FIREBASE_ADMIN_CREDENTIALS, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);
    firebaseAdmin = admin.apps.length ? admin.app() : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
    });
    console.log('[Firebase Admin] Initialized successfully');
  } catch (err) {
    console.error('[Firebase Admin] Failed to initialize admin SDK:', err);
    firebaseAdmin = null;
  }
} else {
  console.warn('[Firebase Admin] FIREBASE_ADMIN_CREDENTIALS not provided; admin SDK not initialized.');
}

export default firebaseAdmin;
