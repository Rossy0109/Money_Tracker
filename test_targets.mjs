
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

async function run() {
  console.log('--- Creating Test Target ---');
  const { data, error } = await supabase
    .from('financial_targets')
    .insert({
      id: crypto.randomUUID(),
      user_id: '41c2813c-29a8-4c4c-a913-b7822131aa71',
      target_name: 'Q2 Savings Goal',
      target_type: 'monthly_profit',
      amount: 5000
    });

  if (error) console.error('Target insert failed:', error.message);
  else console.log('✅ Target created.');

  console.log('--- Verifying Data ---');
  const { data: targets, error: tError } = await supabase.from('financial_targets').select('*');
  if (tError) console.error(tError);
  else console.table(targets);
}

run();
