
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

// Manual SQL to be run in dashboard
const sql = `
CREATE TABLE IF NOT EXISTS financial_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  target_name text NOT NULL,
  target_type text CHECK (target_type IN ('monthly_profit', 'annual_revenue', 'expense_cap')),
  amount numeric(14,2) NOT NULL,
  month_year date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE financial_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY targets_owner ON financial_targets 
  FOR ALL USING (user_id::text = auth.uid());
`;

console.log('--- ACTION REQUIRED: Run this SQL in your Supabase Dashboard ---');
console.log(sql);
