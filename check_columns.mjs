
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function check() {
  const { error } = await supabase.from('accounts').select('currency').limit(1);
  if (error) console.error('Currency column missing:', error.message);
  else console.log('Currency column exists.');

  const { error: insError } = await supabase.from('accounts').select('institution').limit(1);
  if (insError) console.error('Institution column missing:', insError.message);
  else console.log('Institution column exists.');
}

check();
