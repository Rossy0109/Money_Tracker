-- supabase_schema.sql
-- Schema for a money-tracking application: profiles, accounts, categories, transactions, tags

-- Enable extensions commonly used on Supabase
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles table (application-level user data)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid text UNIQUE, -- optional link to Supabase auth.user id
  email text,
  display_name text,
  avatar_url text,
  currency text DEFAULT 'USD',
  locale text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Accounts (bank accounts, cash, cards)
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL, -- e.g. 'checking','savings','credit','cash'
  currency text NOT NULL,
  balance numeric(14,2) DEFAULT 0,
  institution text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Categories (expense/income categories) with optional parent hierarchy
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('expense','income','transfer')),
  color text,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('expense','income','transfer')),
  notes text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(), -- when the transaction happened
  is_cleared boolean DEFAULT false,
  related_transaction_id uuid, -- for transfers (points to the other side)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(occurred_at);

-- Tags (optional many-to-many for transactions)
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

-- Trigger function to keep updated_at current
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers
DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_accounts ON accounts;
CREATE TRIGGER set_updated_at_accounts BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_categories ON categories;
CREATE TRIGGER set_updated_at_categories BEFORE UPDATE ON categories FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_transactions ON transactions;
CREATE TRIGGER set_updated_at_transactions BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- Useful views
CREATE OR REPLACE VIEW user_balances AS
SELECT
  a.user_id,
  a.id as account_id,
  a.name as account_name,
  a.currency,
  a.balance
FROM accounts a;

-- Example policies (commented out) - enable row-level security and tailor to your auth setup
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow access to own accounts" ON accounts FOR ALL USING (user_id = auth.uid());

-- Extra columns for advanced features
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS default_currency text;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_mask text,
  ADD COLUMN IF NOT EXISTS institution_id text;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS vendor text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS is_pending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_id text;

-- Enable Row Level Security and create policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_owner" ON profiles
  FOR ALL
  USING (auth.uid() = auth_uid)
  WITH CHECK (auth.uid() = auth_uid);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_owner" ON accounts
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_owner" ON categories
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_owner" ON transactions
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_owner" ON tags
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

-- End of schema
