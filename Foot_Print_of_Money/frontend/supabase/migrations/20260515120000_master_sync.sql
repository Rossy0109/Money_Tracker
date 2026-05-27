-- 20260515120000_master_sync.sql
-- COMPREHENSIVE HEALING SCRIPT: Run this in Supabase SQL Editor to resolve all schema/permission issues.

-- 1. HARDEN PROFILES TABLE
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'ACCOUNTANT' CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'VIEWER'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. RESET RBAC HELPER
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND role = 'ADMIN' 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ENSURE ALL TABLES HAVE USER_ID AND RLS
DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY['accounts', 'transactions', 'budgets', 'projects', 'categories', 'debts', 'financial_goals', 'bill_reminders', 'financial_targets', 'recurring_transactions'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Ensure user_id column exists
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE', t);
    
    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop old policies to prevent naming conflicts
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_policy ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_user_policy ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_policy ON public.%I', t, t);

    -- Admin: Full Access
    EXECUTE format('CREATE POLICY %I_admin_access ON public.%I FOR ALL USING (public.is_admin())', t, t);

    -- User: Own Data Access + Active Check
    EXECUTE format('CREATE POLICY %I_owner_access ON public.%I FOR ALL 
      USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true))', t, t);
  END LOOP;
END $$;

-- 4. WHITELIST PERMISSIONS
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whitelist_admin" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_read" ON public.whitelist;
CREATE POLICY "whitelist_admin" ON public.whitelist FOR ALL USING (public.is_admin());
CREATE POLICY "whitelist_read" ON public.whitelist FOR SELECT USING (true);

-- 5. REFRESH API CACHE & GRANTS
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- 6. BOOTSTRAP ADMIN (Optional: Replace with your email)
-- UPDATE public.profiles SET role = 'ADMIN', is_active = true WHERE email = 'kamrul01@gmail.com';

COMMENT ON TABLE public.profiles IS 'Master Sync Applied on 2026-05-15';
