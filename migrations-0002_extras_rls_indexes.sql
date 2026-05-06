-- 0002_extras_rls_indexes.sql (moved to repo root as migrations-0002_extras_rls_indexes.sql)
-- Extra columns, indexes, full-text support, and Row Level Security policies

-- Extra profile columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS default_currency text;

-- Extra account columns
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_mask text,
  ADD COLUMN IF NOT EXISTS institution_id text;

-- Extra transaction columns
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS vendor text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS is_pending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_id text;

-- Additional useful indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred_desc ON transactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions (user_id, amount);
CREATE INDEX IF NOT EXISTS idx_accounts_institution_id ON accounts (institution_id);

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_gin ON transactions USING gin (metadata jsonb_path_ops);

-- Full-text search index on notes + vendor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='transactions' AND indexname='idx_transactions_fulltext'
  ) THEN
    CREATE INDEX idx_transactions_fulltext ON transactions USING gin (to_tsvector('english', coalesce(notes,'') || ' ' || coalesce(vendor,'')));
  END IF;
END$$;

-- Enable Row Level Security and policies for each table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS profiles_owner ON profiles
  FOR ALL
  USING (auth.uid() = auth_uid)
  WITH CHECK (auth.uid() = auth_uid);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS accounts_owner ON accounts
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS categories_owner ON categories
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS transactions_owner ON transactions
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tags_owner ON tags
  FOR ALL
  USING (user_id::text = auth.uid())
  WITH CHECK (user_id::text = auth.uid());

-- Convenience function to create linked transfer transactions
CREATE OR REPLACE FUNCTION create_transfer(
  p_user_id uuid,
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_currency text,
  p_notes text DEFAULT NULL
) RETURNS TABLE(from_tx uuid, to_tx uuid) AS $$
DECLARE
  v_from uuid;
  v_to uuid;
BEGIN
  INSERT INTO transactions (user_id, account_id, amount, currency, type, notes, occurred_at, is_cleared)
  VALUES (p_user_id, p_from_account, -abs(p_amount), p_currency, 'transfer', p_notes, now(), true)
  RETURNING id INTO v_from;

  INSERT INTO transactions (user_id, account_id, amount, currency, type, notes, occurred_at, is_cleared, related_transaction_id)
  VALUES (p_user_id, p_to_account, abs(p_amount), p_currency, 'transfer', p_notes, now(), true, v_from)
  RETURNING id INTO v_to;

  UPDATE transactions SET related_transaction_id = v_to WHERE id = v_from;

  RETURN QUERY SELECT v_from, v_to;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (policy will still restrict visibility)
GRANT EXECUTE ON FUNCTION create_transfer(uuid, uuid, uuid, numeric, text, text) TO authenticated;

-- End of extras
