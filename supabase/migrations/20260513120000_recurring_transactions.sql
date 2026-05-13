-- 20260513120000_recurring_transactions.sql
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('expense','income')),
  frequency text NOT NULL DEFAULT 'monthly', -- daily, weekly, monthly, yearly
  category_name text,
  next_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_access" ON public.recurring_transactions FOR ALL USING (auth.uid() = user_id);
