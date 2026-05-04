import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("[Firebase] Initializing configuration...");

const firebaseConfig = {
    apiKey: "AIzaSyAy3rlUWmgPEMy0IgZXp_koD314H8XeqC4",
    authDomain: "ahmeed-steel-industry.firebaseapp.com",
    projectId: "ahmeed-steel-industry",
    storageBucket: "ahmeed-steel-industry.firebasestorage.app",
    messagingSenderId: "175050164901",
    appId: "1:175050164901:web:6b5ec4d78151c5248e9b4c"
};

let app, db, auth, googleProvider;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    console.log("[Firebase] Services initialized successfully.");
} catch (error) {
    console.error("[Firebase] Initialization error:", error);
    alert("Firebase initialization failed. Please check your configuration.");
}

// Security Constants
const ADMIN_EMAIL = "rossy@example.com"; // To be moved to app_metadata collection in future

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

export { db, auth, googleProvider, ADMIN_EMAIL, logEvent };
