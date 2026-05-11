
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function finalize() {
  const ADMIN_ID = '41c2813c-29a8-4c4c-a913-b7822131aa71';
  console.log('--- Finalizing Master Data for Admin:', ADMIN_ID, '---');

  // 1. Create Default Project
  const { data: project, error: pError } = await supabase
    .from('projects')
    .upsert({ 
      id: crypto.randomUUID(), 
      name: 'General Business', 
      budget: 10000, 
      status: 'active' 
    }, { onConflict: 'name' })
    .select()
    .single();

  if (pError) console.error('Project Error:', pError.message);
  else console.log('✅ Project "General Business" ready:', project.id);

  // 2. Create Default Account
  const { data: account, error: aError } = await supabase
    .from('accounts')
    .upsert({ 
      id: crypto.randomUUID(),
      user_id: ADMIN_ID, 
      name: 'Main Wallet', 
      type: 'cash', 
      currency: 'USD', 
      balance: 1000 
    }, { onConflict: 'name,user_id' })
    .select()
    .single();

  if (aError) console.error('Account Error:', aError.message);
  else console.log('✅ Account "Main Wallet" ready.');

  // 3. Create Standard Categories
  const categories = [
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Salary', type: 'income', color: '#10b981' },
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Sales', type: 'income', color: '#34d399' },
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Rent', type: 'expense', color: '#ef4444' },
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Food', type: 'expense', color: '#f59e0b' },
    { id: crypto.randomUUID(), user_id: ADMIN_ID, name: 'Utilities', type: 'expense', color: '#6366f1' }
  ];

  const { error: catError } = await supabase
    .from('categories')
    .upsert(categories, { onConflict: 'name,user_id' });

  if (catError) console.error('Category Error:', catError.message);
  else console.log('✅ Standard categories initialized.');

  // 4. Link Admin to Project
  if (project) {
    const { error: tmError } = await supabase
      .from('team_members')
      .upsert({
        user_id: ADMIN_ID,
        project_id: project.id,
        role: 'admin'
      });
    if (tmError) console.error('Team Member Error:', tmError.message);
    else console.log('✅ Admin linked to General Business project.');
  }
}

finalize();
