
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

async function run() {
    console.log('--- Verifying Schema Access ---');
    const tables = ['projects', 'financial_targets', 'transactions'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (error) console.log(`❌ Table '${t}' is not accessible:`, error.message);
        else console.log(`✅ Table '${t}' is fully accessible.`);
    }
}
run();
