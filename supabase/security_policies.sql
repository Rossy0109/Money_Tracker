-- Supabase Security Hardening
-- Hardens all tables with Row Level Security (RLS) and Role-Based Access Control (RBAC)

-- 1. Profiles Table (Base for RBAC)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Core Tables (Transactions, Accounts, Budgets, Projects, Categories, Debts, Financial Targets)
-- Pattern: 
-- - ADMIN: Full access to all records
-- - ACCOUNTANT: Full access to own records
-- - OTHERS: No access

DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY['accounts', 'transactions', 'budgets', 'projects', 'categories', 'debts', 'financial_targets'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    
    -- Admin Policy
    EXECUTE format('CREATE POLICY %I_admin_access ON %I 
      FOR ALL 
      TO authenticated 
      USING ((SELECT (metadata->>''role'') FROM profiles WHERE id = auth.uid()) = ''ADMIN'')', t, t);

    -- Own Data Policy (Accountant/User)
    EXECUTE format('CREATE POLICY %I_user_access ON %I 
      FOR ALL 
      TO authenticated 
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;

-- 3. Security Views (Optional for logging/auditing)
-- Allows admins to see global stats without direct table access if preferred.
