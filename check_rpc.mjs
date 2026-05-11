
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Checking for RPCs ---');
  // We can't list RPCs easily, but we can try to call common ones.
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
  if (error) {
    console.error('RPC exec_sql not found or error:', error.message);
  } else {
    console.log('✅ exec_sql RPC is available!');
  }
}

run();
