-- 20260511000000_data_layer_completion.sql
-- Completes the schema for missing components: Budgets, Recurring Templates, Goals, Debts, and Reminders.

-- 1. Hardening existing tables with defaults
ALTER TABLE accounts ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE transactions ALTER COLUMN currency SET DEFAULT 'USD';

-- 2. Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  month_year date,
  created_at timestamptz DEFAULT now()
);

-- 3. Recurring Templates
CREATE TABLE IF NOT EXISTS recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  day integer CHECK (day >= 1 AND day <= 31),
  created_at timestamptz DEFAULT now()
);

-- 4. Financial Goals (Aligning with code name)
CREATE TABLE IF NOT EXISTS financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount numeric(14,2) NOT NULL DEFAULT 0,
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 5. Debts
CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  apr numeric(5,2) DEFAULT 0,
  min_payment numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 6. Bill Reminders
CREATE TABLE IF NOT EXISTS bill_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  repeat_monthly boolean DEFAULT false,
  is_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 7. Enable RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_reminders ENABLE ROW LEVEL SECURITY;

-- 8. Ownership Policies
CREATE POLICY budgets_owner ON budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY recurring_owner ON recurring_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY goals_owner ON financial_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY debts_owner ON debts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY reminders_owner ON bill_reminders FOR ALL USING (auth.uid() = user_id);
