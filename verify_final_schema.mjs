// verify_final_schema.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function verify() {
    const tables = [
        'budgets', 
        'recurring_templates', 
        'financial_goals', 
        'debts', 
        'bill_reminders'
    ];

    console.log("Verifying table creation...");
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.error(`❌ Table ${table} is missing or inaccessible:`, error.message);
        } else {
            console.log(`✅ Table ${table} exists and is accessible.`);
        }
    }
}

verify().catch(console.error);
