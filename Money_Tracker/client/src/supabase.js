import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ulmaomfsyjbwcwecutcp.supabase.co';
const supabaseAnonKey = 'sb_publishable_q1xXSPOatO5A4TqibiPfBA_KdK9q2NA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
