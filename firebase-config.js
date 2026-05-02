// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAy3rlUWmgPEMy0IgZXp_koD314H8XeqC4",
    authDomain: "ahmeed-steel-industry.firebaseapp.com",
    projectId: "ahmeed-steel-industry",
    storageBucket: "ahmeed-steel-industry.firebasestorage.app",
    messagingSenderId: "175050164901",
    appId: "1:175050164901:web:6b5ec4d78151c5248e9b4c"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
