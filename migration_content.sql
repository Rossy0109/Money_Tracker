CREATE TABLE IF NOT EXISTS recurring_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_day_of_month integer NOT NULL CHECK (due_day_of_month BETWEEN 1 AND 31),
  is_active boolean DEFAULT true,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_bills_owner" ON recurring_bills 
  FOR ALL USING (user_id::text = auth.uid());
