
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function check() {
  console.log('--- Checking Accounts Schema ---');
  const { data, error } = await supabase.from('accounts').select('*').limit(1);
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Sample Row:', data);
    // Try to get column names by selecting from a non-existent column
    const { error: colError } = await supabase.from('accounts').select('id,name,type,balance,user_id');
    if (colError) console.error('Column Check Error:', colError.message);
    else console.log('Basic columns (id,name,type,balance,user_id) exist.');
  }
}

check();
