
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function init() {
  const ADMIN_ID = '41c2813c-29a8-4c4c-a913-b7822131aa71';
  console.log('--- Initializing Data with Minimum Columns ---');

  // 1. Create Default Account (No currency/institution)
  const { data: account, error: aError } = await supabase
    .from('accounts')
    .insert({ 
      id: crypto.randomUUID(),
      user_id: ADMIN_ID, 
      name: 'Main Wallet', 
      type: 'cash', 
      balance: 1000 
    })
    .select()
    .single();

  if (aError) console.error('Account Error:', aError.message);
  else console.log('✅ Account "Main Wallet" ready.');

  // 2. Create Standard Categories (No ON CONFLICT specification)
  const categories = [
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Salary', type: 'income', color: '#10b981' },
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Rent', type: 'expense', color: '#ef4444' }
  ];

  const { error: catError } = await supabase
    .from('categories')
    .insert(categories);

  if (catError) console.error('Category Error:', catError.message);
  else console.log('✅ Standard categories initialized.');
}

init();
