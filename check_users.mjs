
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function check() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Failed to list users:', error.message);
  } else {
    console.log('Total Users:', users.users.length);
    if (users.users.length > 0) {
      console.log('First User ID:', users.users[0].id);
    }
  }
}

check();
