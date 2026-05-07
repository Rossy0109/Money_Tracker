import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

console.log("[Firebase] Initializing configuration...");

// Use placeholders for security - these will be replaced during build/deployment
// The code reads from (in order): process.env (Node/bundler), window.__ENV (static injection), then falls back to placeholders.
const _getEnv = (key) => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    } catch (e) {}
    try {
        if (typeof window !== 'undefined' && window.__ENV && window.__ENV[key]) return window.__ENV[key];
    } catch (e) {}
    return `__${key}__`;
};

const firebaseConfig = {
    apiKey: _getEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: _getEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: _getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: _getEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: _getEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: _getEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
    measurementId: _getEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID') || undefined
};


let app, db, auth, storage, googleProvider;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
    googleProvider = new GoogleAuthProvider();
    console.log("[Firebase] Services initialized successfully. API Key:", firebaseConfig.apiKey);
} catch (error) {
    console.error("[Firebase] Initialization error:", error);
}

// Security Constants
const ADMIN_EMAIL = "__ADMIN_EMAIL__"; 

/**
 * Log sensitive events to Firestore
 */
async function logEvent(type, userId, details = {}) {
    try {
        const { addDoc, collection, Timestamp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await addDoc(collection(db, "logs"), {
            type,
            userId: userId || "anonymous",
            timestamp: Timestamp.now(),
            details,
            userAgent: navigator.userAgent
        });
    } catch (err) {
        console.error("[Log] Failed to log event:", err);
    }
}

export { app, db, auth, storage, googleProvider, ADMIN_EMAIL, logEvent };
