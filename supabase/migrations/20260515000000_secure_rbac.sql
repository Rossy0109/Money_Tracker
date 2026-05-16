-- 20260515000000_secure_rbac.sql
-- Security Hardening: Dedicated Role column and Privilege Escalation Prevention

-- 1. Add role column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'ACCOUNTANT' CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'VIEWER'));

-- 2. Migrate existing roles from metadata to the new column
UPDATE public.profiles 
SET role = COALESCE(metadata->>'role', 'ACCOUNTANT');

-- 3. Update is_admin() helper to use the hardened role column
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

-- 4. Trigger to prevent non-admins from changing sensitive fields (role, is_active)
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role text;
BEGIN
    -- Get the role of the person making the change
    SELECT role INTO current_user_role FROM public.profiles WHERE id = auth.uid();

    -- If sensitive fields are changing, check if the caller is an ADMIN
    IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
        IF current_user_role IS DISTINCT FROM 'ADMIN' THEN
            -- Special exception for the bootstrap admin email
            -- This allows the initial sync to set the admin role
            IF (NEW.email = 'kamrul01@gmail.com' AND auth.uid() = NEW.id) THEN
                RETURN NEW;
            END IF;
            
            RAISE EXCEPTION 'Unauthorized: Only admins can modify user roles or activation status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER trigger_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

-- 5. Harden RLS for Core Financial Tables to ensure is_active check
-- The previous migrations used a mix of checks. Let's unify them.

DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY['accounts', 'transactions', 'budgets', 'projects', 'categories', 'debts', 'financial_targets', 'bill_reminders'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop old policies to avoid duplicates and naming conflicts from previous versions
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_policy ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_user_policy ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_user_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_access ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_policy ON public.%I', t, t);

    -- Admin: Full Access
    EXECUTE format('CREATE POLICY %I_admin_access ON public.%I FOR ALL USING (public.is_admin())', t, t);

    -- User/Accountant: Own Data Access + Active Check
    EXECUTE format('CREATE POLICY %I_owner_access ON public.%I FOR ALL 
      USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true))', t, t);
  END LOOP;
END $$;
