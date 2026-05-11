
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function init() {
  console.log('--- Initializing Master Data (Retry with explicit UUIDs) ---');

  // 1. Get or Create a Global Admin Profile
  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .single();

  if (profileError || !profile) {
    console.log('No profile found. Creating a system admin profile...');
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert([
        { 
          id: crypto.randomUUID(),
          display_name: 'System Admin', 
          email: 'admin@moneytracker.local',
          currency: 'USD'
        }
      ])
      .select()
      .single();
    
    if (createError) {
      console.error('Failed to create profile:', createError.message);
      return;
    }
    profile = newProfile;
  }
  console.log('Using Profile ID:', profile.id);

  // 2. Create Default Project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .upsert({ id: crypto.randomUUID(), name: 'General Business', budget: 10000, status: 'active' }, { onConflict: 'name' })
    .select()
    .single();

  if (projectError) {
    console.error('Failed to create project (Did you run the SQL in Dashboard?):', projectError.message);
  } else {
    console.log('Project "General Business" ready.');
  }

  // 3. Create Default Account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .upsert({ 
      id: crypto.randomUUID(),
      user_id: profile.id, 
      name: 'Main Wallet', 
      type: 'cash', 
      currency: 'USD', 
      balance: 0 
    }, { onConflict: 'name,user_id' })
    .select()
    .single();

  if (accountError) {
    console.error('Failed to create account:', accountError.message);
  } else {
    console.log('Account "Main Wallet" ready.');
  }

  // 4. Create Standard Categories
  const categories = [
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Salary', type: 'income', color: '#10b981' },
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Sales', type: 'income', color: '#34d399' },
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Rent', type: 'expense', color: '#ef4444' },
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Food', type: 'expense', color: '#f59e0b' },
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Utilities', type: 'expense', color: '#6366f1' },
    { id: crypto.randomUUID(), user_id: profile.id, name: 'Inventory', type: 'expense', color: '#8b5cf6' }
  ];

  const { error: catError } = await supabase
    .from('categories')
    .upsert(categories, { onConflict: 'name,user_id' });

  if (catError) {
    console.error('Failed to create categories:', catError.message);
  } else {
    console.log('Standard categories initialized.');
  }

  console.log('\n--- Initialization Complete ---');
}

init();
