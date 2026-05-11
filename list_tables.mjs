
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Listing Tables ---');
  // Querying pg_catalog via rpc or just a raw query if enabled, 
  // but we'll try a common trick to get table names from a known endpoint
  // Or just try to select from a table that might exist.
  
  const { data, error } = await supabase.rpc('get_tables'); // Custom RPC if it exists
  if (error) {
    console.log('RPC get_tables failed, trying raw query via PostgREST metadata');
    const { data: tables, error: tError } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
    if (tError) {
      console.error(tError);
    } else {
      console.table(tables);
    }
  } else {
    console.table(data);
  }
}

run();
