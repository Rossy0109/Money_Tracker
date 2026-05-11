
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

async function run() {
    console.log('--- Checking if financial_targets exists directly ---');
    const { data, error } = await supabase.from('financial_targets').select('*');
    if (error) console.log('Error:', error.message);
    else console.log('Data:', data);
}

run();
