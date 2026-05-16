/**
 * lib/auth.js
 * Supabase Auth Helpers with Profile Sync
 */
import { supabase } from "./supabase";
import { DataHub } from "./data-hub";
import { ADMIN_EMAIL } from "./constants";

/**
 * Handles profile sync with strict registration control.
 * Rule: NO public self-registration unless whitelisted.
 */
const syncProfile = async (sessionUser) => {
    try {
        const isAdminIdentity = sessionUser.email === ADMIN_EMAIL;
        
        // 1. Check if user already exists in public.profiles
        const { data: existingProfile, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionUser.id)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error("[Auth] Profile fetch error:", fetchError);
            // Don't throw here if it's just a schema cache issue, try to proceed
        }

        // 2. If no profile, check whitelist for "pre-approved" users
        let whitelistedRole = 'ACCOUNTANT';
        if (!isAdminIdentity && !existingProfile) {
            const { data: whitelistEntry } = await supabase
                .from('whitelist')
                .select('role')
                .eq('email', sessionUser.email)
                .single();
            
            if (!whitelistEntry) {
                console.warn(`[Auth] Blocked registration attempt: ${sessionUser.email}`);
                await supabase.auth.signOut();
                throw new Error("Registration is disabled. Please contact the administrator.");
            }
            whitelistedRole = whitelistEntry.role;
        }

        // Resilient fallback logic for role and is_active
        // If the 'role' column doesn't exist in existingProfile (cache issue), fallback to metadata
        const currentRole = existingProfile?.role || existingProfile?.metadata?.role || whitelistedRole;
        const isActive = isAdminIdentity ? true : (existingProfile?.is_active ?? false);

        const profile = {
            id: sessionUser.id,
            email: sessionUser.email,
            display_name: isAdminIdentity ? 'Kamrul (Admin)' : (sessionUser.user_metadata?.full_name || sessionUser.email.split('@')[0]),
            avatar_url: sessionUser.user_metadata?.avatar_url,
            role: isAdminIdentity ? 'ADMIN' : currentRole,
            is_active: isActive,
            metadata: { 
                ...existingProfile?.metadata,
                last_login: new Date().toISOString()
            }
        };
        
        const data = await DataHub.upsertProfile(profile);
        DataHub.setUser(sessionUser.id);
        return { ...profile, ...data }; // Merge local and remote
    } catch (error) {
        console.error("[Auth] Sync Error:", error.message);
        throw error;
    }
};

export const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined
        }
    });
    if (error) throw error;
    return data;
};

export const loginWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    
    const profile = await syncProfile(data.user);
    
    // Set cookies for middleware
    if (typeof document !== 'undefined') {
        document.cookie = `fom_session=${data.user.id}; path=/; max-age=3600; SameSite=Lax`;
        document.cookie = `fom_role=${profile.role}; path=/; max-age=3600; SameSite=Lax`;
    }
    
    return data.user;
};

export const logout = async () => {
    await supabase.auth.signOut();
    DataHub.setUser(null);
    if (typeof document !== 'undefined') {
        document.cookie = 'fom_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'fom_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
};

export const subscribeToAuth = (callback) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            DataHub.setUser(session.user.id);
            // We sync profile on every login event to ensure metadata is fresh
            if (event === 'SIGNED_IN') {
                try {
                    const profile = await syncProfile(session.user);
                    // Update cookies on successful sync
                    if (typeof document !== 'undefined') {
                        document.cookie = `fom_session=${session.user.id}; path=/; max-age=3600; SameSite=Lax`;
                        document.cookie = `fom_role=${profile.role}; path=/; max-age=3600; SameSite=Lax`;
                    }
                } catch (e) {
                    console.error("Auth sync failed", e);
                }
            }
            callback(session.user);
        } else {
            DataHub.setUser(null);
            callback(null);
        }
    });

    return () => subscription.unsubscribe();
};
