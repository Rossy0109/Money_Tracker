-- 20260513000000_unified_stack.sql
-- Unified Schema and RLS for Supabase Auth Integration

-- 1. Ensure Auth Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles Table (Referencing auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  metadata jsonb DEFAULT '{"role": "ACCOUNTANT"}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Whitelist for restricted registration
CREATE TABLE IF NOT EXISTS public.whitelist (
  email text PRIMARY KEY,
  role text DEFAULT 'ACCOUNTANT',
  invited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 4. Projects & Team Members
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  budget numeric(14,2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  role text DEFAULT 'manager' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at timestamptz DEFAULT now()
);

-- 5. Financial Data Tables (Aligning with auth.users)
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  currency text DEFAULT 'USD',
  balance numeric(14,2) DEFAULT 0,
  institution text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('expense','income','transfer')),
  color text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name text,
  type text NOT NULL CHECK (type IN ('expense','income','transfer')),
  notes text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_cleared boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  month_year date,
  created_at timestamptz DEFAULT now()
);

-- 6. Helper Functions for RBAC
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

-- 7. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- 8. Policies
-- Profiles: Users can see their own profile or admins can see all
CREATE POLICY "profiles_access" ON public.profiles FOR ALL USING (auth.uid() = id OR public.is_admin());

-- Whitelist: Admins only for full access, everyone can read (to check eligibility)
CREATE POLICY "whitelist_admin" ON public.whitelist FOR ALL USING (public.is_admin());
CREATE POLICY "whitelist_read" ON public.whitelist FOR SELECT USING (true);

-- Projects: Owner or team member
CREATE POLICY "projects_access" ON public.projects FOR ALL USING (
  auth.uid() = user_id 
  OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.project_id = id AND tm.user_id = auth.uid())
);

-- Data Tables (Transactions, Accounts, etc.)
CREATE POLICY "transactions_access" ON public.transactions FOR ALL USING (
  auth.uid() = user_id 
  OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.project_id = project_id AND tm.user_id = auth.uid())
);

CREATE POLICY "accounts_access" ON public.accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "categories_access" ON public.categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "budgets_access" ON public.budgets FOR ALL USING (auth.uid() = user_id);
