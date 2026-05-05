import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

console.log("[Firebase] Initializing configuration...");

// Use placeholders for security - these will be replaced during build/deployment
const firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
};

let app, db, auth, storage, googleProvider;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
    googleProvider = new GoogleAuthProvider();
    console.log("[Firebase] Services initialized successfully.");
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

export { db, auth, storage, googleProvider, ADMIN_EMAIL, logEvent };
