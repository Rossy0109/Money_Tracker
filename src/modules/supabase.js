const SUPABASE_URL = window.__ENV?.SUPABASE_URL || localStorage.getItem('SUPABASE_URL');
const SUPABASE_KEY = window.__ENV?.SUPABASE_KEY || localStorage.getItem('SUPABASE_KEY');

export const isSupabaseConfigured = Boolean(
    SUPABASE_URL && 
    SUPABASE_KEY && 
    SUPABASE_URL !== 'your_project_url' && 
    SUPABASE_KEY !== 'your_anon_key' &&
    SUPABASE_URL.startsWith('http')
);

let client = null;
if (isSupabaseConfigured && window.supabase) {
    try {
        const { createClient } = window.supabase;
        client = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (err) {
        console.warn("Supabase client creation failed, operating in local mode:", err);
    }
}

export const supabaseClient = client;

