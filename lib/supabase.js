import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ulmaomfsyjbwcwecutcp.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbWFvbWZzeWpid2N3ZWN1dGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTYwNTYsImV4cCI6MjA5MzEzMjA1Nn0.pimvuQyjqq1t5VI936Inau_B0waDUxiwWkvzWftsXkU";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
