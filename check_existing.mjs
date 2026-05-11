
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Profiles ---');
  const { data, error } = await supabase.from('profiles').select('*').limit(5);
  if (error) console.error(error);
  else console.table(data);

  console.log('--- Transactions ---');
  const { data: tData, error: tError } = await supabase.from('transactions').select('*').limit(5);
  if (tError) console.error(tError);
  else console.table(tData);
}

run();
