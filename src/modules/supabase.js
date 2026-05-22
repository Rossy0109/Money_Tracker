const SUPABASE_URL = window.__ENV?.SUPABASE_URL || localStorage.getItem('SUPABASE_URL');
const SUPABASE_KEY = window.__ENV?.SUPABASE_KEY || localStorage.getItem('SUPABASE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY === 'your_project_url') {
    const url = prompt("Enter Supabase URL:");
    const key = prompt("Enter Supabase Anon Key:");
    if (url && key) {
        localStorage.setItem('SUPABASE_URL', url);
        localStorage.setItem('SUPABASE_KEY', key);
        location.reload();
    }
}

const { createClient } = window.supabase;
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
