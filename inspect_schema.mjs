
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function inspect() {
  const { data, error } = await supabase.rpc('inspect_table_constraints', { t_name: 'profiles' });
  if (error) {
    console.log('RPC inspect_table_constraints missing. Trying information_schema query...');
    // PostgREST usually restricts information_schema unless explicitly granted, but let's try.
    const { data: rows, error: e } = await supabase.from('information_schema.key_column_usage').select('*').eq('table_name', 'profiles');
    if (e) console.error('Could not inspect constraints:', e.message);
    else console.table(rows);
  } else {
    console.table(data);
  }
}

inspect();
