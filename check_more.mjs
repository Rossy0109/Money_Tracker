
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Checking Accounts ---');
  const { data, error } = await supabase.from('accounts').select('*').limit(5);
  if (error) {
    console.error('Accounts table missing or error:', error.message);
  } else {
    console.table(data);
  }

  console.log('\n--- Checking Categories ---');
  const { data: cData, error: cError } = await supabase.from('categories').select('*').limit(5);
  if (cError) {
    console.error('Categories table missing or error:', cError.message);
  } else {
    console.table(cData);
  }
}

run();
