import { supabaseClient } from './supabase.js';

let user = null;
export let isSignup = false;

export function getUser() { return user; }
export function setUser(newUser) { user = newUser; }

export async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { error } = isSignup 
        ? await supabaseClient.auth.signUp({ email, password }) 
        : await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        alert("Login/Signup Error: " + error.message);
    }
}

export function toggleAuthMode(isSignupMode) {
    isSignup = isSignupMode;
}

export function logout() {
    return supabaseClient.auth.signOut();
}
