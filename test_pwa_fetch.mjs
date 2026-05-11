
import { createClient } from '@supabase/supabase-js';

// Re-using same logic as supabase-client.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing PWA category fetch via Node-safe client...');
  const { data, error } = await supabase.from('categories').select('name,type');
  if (error) console.error('Fetch Error:', error.message);
  else console.log('Successfully fetched categories:', data);
}

test();
