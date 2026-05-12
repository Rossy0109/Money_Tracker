-- ==========================================
-- 1. PROFILES & RBAC SCHEMA
-- ==========================================

-- Table to store user roles and metadata
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  metadata jsonb DEFAULT '{"role": "ACCOUNTANT"}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Whitelist for restricted registration
CREATE TABLE IF NOT EXISTS public.whitelist (
  email text PRIMARY KEY,
  role text DEFAULT 'ACCOUNTANT',
  invited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access to whitelist" ON public.whitelist FOR ALL USING (public.is_admin());
CREATE POLICY "Public can check own email in whitelist" ON public.whitelist FOR SELECT USING (true); -- Required for syncProfile check

-- ==========================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT (metadata->>'role' = 'ADMIN')
    FROM public.profiles
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Profiles are viewable by owner and admin" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admin can insert/invite users" 
ON public.profiles FOR INSERT 
WITH CHECK (public.is_admin());

CREATE POLICY "Profiles are updatable by owner and admin" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id OR public.is_admin());

-- ==========================================
-- 3. CORE FINANCIAL TABLES RLS
-- ==========================================

DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY['accounts', 'transactions', 'budgets', 'projects', 'categories', 'debts', 'financial_targets', 'bill_reminders'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    
    -- Admin: Full Access
    EXECUTE format('CREATE POLICY %I_admin_policy ON %I FOR ALL USING (public.is_admin())', t, t);

    -- User/Accountant: Own Data Access
    EXECUTE format('CREATE POLICY %I_user_policy ON %I FOR ALL 
      USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true))', t, t);
  END LOOP;
END $$;

-- ==========================================
-- 4. TRIGGERS
-- ==========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profiles_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
