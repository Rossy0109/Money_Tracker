import { supabaseClient } from './supabase.js';

let user = JSON.parse(localStorage.getItem('local_user') || 'null');
export let isSignup = false;

export function getUser() { return user; }
export function setUser(newUser) { 
    user = newUser; 
    if (newUser) {
        localStorage.setItem('local_user', JSON.stringify(newUser));
    } else {
        localStorage.removeItem('local_user');
    }
}

export async function handleAuth(e) {
    if (e && e.preventDefault) e.preventDefault();
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passEl ? passEl.value : '';

    if (!email) return;

    if (supabaseClient) {
        const { data, error } = isSignup 
            ? await supabaseClient.auth.signUp({ email, password }) 
            : await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) {
            alert("Authentication Error: " + error.message);
            return false;
        }
        if (data?.user) setUser(data.user);
        return true;
    } else {
        // Guest/Local mode auth
        const guestUser = { id: 'local-user-id', email: email || 'demo@local.app', is_guest: true };
        setUser(guestUser);
        return true;
    }
}

export function loginAsGuest() {
    const demoUser = { id: 'demo-user-101', email: 'demo.user@finance.app', user_metadata: { name: 'Demo Manager' }, is_guest: true };
    setUser(demoUser);
    return demoUser;
}

export function toggleAuthMode(isSignupMode) {
    isSignup = isSignupMode;
}

export async function logout() {
    if (supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (e) { console.warn(e); }
    }
    setUser(null);
    location.reload();
}

