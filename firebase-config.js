// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAy3rlUWmgPEMy0IgZXp_koD314H8XeqC4",
    authDomain: "ahmeed-steel-industry.firebaseapp.com",
    projectId: "ahmeed-steel-industry",
    storageBucket: "ahmeed-steel-industry.firebasestorage.app",
    messagingSenderId: "175050164901",
    appId: "1:175050164901:web:6b5ec4d78151c5248e9b4c"
};

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase Config (keep existing config object here)
const firebaseConfig = {
  // ... (Assuming these are already present or defined by you)
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
