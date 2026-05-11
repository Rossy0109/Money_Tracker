
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Financial Overview ---');
  
  // 1. Total Balance
  const { data: accounts, error: aError } = await supabase.from('accounts').select('balance');
  if (aError) {
    console.error('Error fetching accounts:', aError.message);
  } else {
    const totalBalance = accounts.reduce((acc, curr) => acc + Number(curr.balance || 0), 0);
    console.log(`Total Balance: ${totalBalance}`);
  }

  // 2. Transaction Count
  const { count, error: tError } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
  if (tError) {
    console.error('Error fetching transactions:', tError.message);
  } else {
    console.log(`Total Transactions: ${count}`);
  }

  // 3. User Count
  const { count: uCount, error: uError } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (uError) {
    console.error('Error fetching profiles:', uError.message);
  } else {
    console.log(`Total Users (Profiles): ${uCount}`);
  }
}

run();
