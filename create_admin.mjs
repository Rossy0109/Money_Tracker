
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function createAdmin() {
  console.log('--- Creating System Admin User ---');
  
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@moneytracker.local',
    password: 'password123',
    email_confirm: true,
    user_metadata: { display_name: 'System Admin' }
  });

  if (error) {
    console.error('Failed to create user:', error.message);
  } else {
    console.log('User created successfully!');
    console.log('User ID:', data.user.id);
    
    // Check if profile was created automatically
    setTimeout(async () => {
      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      
      if (pError) {
        console.log('Profile NOT found. Attempting manual creation...');
        const { error: mError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: 'admin@moneytracker.local',
            display_name: 'System Admin'
          });
        
        if (mError) console.error('Manual profile creation failed:', mError.message);
        else console.log('Profile created manually.');
      } else {
        console.log('Profile found (Auto-created by trigger)!');
      }
    }, 2000);
  }
}

createAdmin();
