-- 1. Sentinel Function for Transactions
CREATE OR REPLACE FUNCTION validate_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent negative amounts
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be positive';
  END IF;
  
  -- Prevent future-dated transactions
  IF NEW.date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Transaction date cannot be in the future';
  END IF;

  -- Ensure project context
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'Transaction must be linked to a project';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach Trigger
DROP TRIGGER IF EXISTS trg_validate_transaction ON transactions;
CREATE TRIGGER trg_validate_transaction
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_transaction();

-- 3. Sentinel Function for Recurring Bills
CREATE OR REPLACE FUNCTION validate_recurring_bill()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Bill amount must be positive';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach Trigger
DROP TRIGGER IF EXISTS trg_validate_recurring_bill ON recurring_bills;
CREATE TRIGGER trg_validate_recurring_bill
BEFORE INSERT OR UPDATE ON recurring_bills
FOR EACH ROW EXECUTE FUNCTION validate_recurring_bill();
