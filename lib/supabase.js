import { createClient } from '@supabase/supabase-js';

// Single instance initialization for the entire app
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[Supabase] Missing environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
