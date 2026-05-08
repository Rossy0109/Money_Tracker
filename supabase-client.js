// supabase-client.js - Frontend Supabase client (browser-safe)
// Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const _getEnv = (key) => {
  try { if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key]; } catch (e) {}
  try { if (typeof window !== 'undefined' && window.__ENV && window.__ENV[key]) return window.__ENV[key]; } catch (e) {}
  return `__${key}__`;
};

const SUPABASE_URL = _getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = _getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || _getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/ANON_KEY.');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
