/**
 * lib/auth.js
 * Firebase Auth Helpers with Supabase Profile Sync
 */
import { 
    signInWithPopup, 
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from "firebase/auth";
import { auth, googleProvider, ADMIN_EMAIL } from "./firebase";
import { supabase } from "./supabase";
import { DataHub } from "./data-hub";

/**
 * Handles profile sync with strict registration control.
 * Rule: NO public self-registration.
 */
const syncProfile = async (firebaseUser) => {
    try {
        const isAdminIdentity = firebaseUser.email === ADMIN_EMAIL;
        
        // 1. Check if user already exists in Supabase profiles
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', firebaseUser.uid)
            .single();

        // 2. If no profile, check whitelist for "pre-approved" users
        let whitelistedRole = 'ACCOUNTANT';
        if (!isAdminIdentity && !existingProfile) {
            const { data: whitelistEntry } = await supabase
                .from('whitelist')
                .select('role')
                .eq('email', firebaseUser.email)
                .single();
            
            if (!whitelistEntry) {
                console.warn(`[Auth] Blocked registration attempt: ${firebaseUser.email}`);
                await firebaseSignOut(auth);
                throw new Error("Registration is disabled. Please contact the administrator.");
            }
            whitelistedRole = whitelistEntry.role;
        }

        const profile = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            display_name: isAdminIdentity ? 'Kamrul (Admin)' : (firebaseUser.displayName || firebaseUser.email.split('@')[0]),
            avatar_url: firebaseUser.photoURL,
            metadata: { 
                ...existingProfile?.metadata,
                last_login: new Date().toISOString(),
                role: isAdminIdentity ? 'ADMIN' : (existingProfile?.metadata?.role || whitelistedRole)
            }
        };
        
        const data = await DataHub.upsertProfile(profile);
        DataHub.setUser(firebaseUser.uid);
        return data;
    } catch (error) {
        console.error("[Auth] Sync Error:", error.message);
        throw error;
    }
};

export const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const profile = await syncProfile(result.user);
    document.cookie = `fom_session=${result.user.uid}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `fom_role=${profile.metadata.role}; path=/; max-age=3600; SameSite=Lax`;
    return result.user;
};

export const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const profile = await syncProfile(result.user);
    document.cookie = `fom_session=${result.user.uid}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `fom_role=${profile.metadata.role}; path=/; max-age=3600; SameSite=Lax`;
    return result.user;
};

export const logout = async () => {
    await firebaseSignOut(auth);
    DataHub.setUser(null);
    document.cookie = 'fom_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'fom_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
};

export const subscribeToAuth = (callback) => {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            DataHub.setUser(user.uid);
            callback(user);
        } else {
            DataHub.setUser(null);
            callback(null);
        }
    });
};
