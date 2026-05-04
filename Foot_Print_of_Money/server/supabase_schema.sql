-- 💰 Foot Print of Money - Supabase (PostgreSQL) Schema

-- 1. Security/Password Table
CREATE TABLE security (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Enforce single row for master password
    password_hash TEXT NOT NULL
);

-- 2. Accounts Table
CREATE TABLE accounts (
    account_id SERIAL PRIMARY KEY,
    account_name TEXT NOT NULL UNIQUE,
    account_type TEXT NOT NULL CHECK(account_type IN ('আয়', 'খরচ')),
    category TEXT,
    icon TEXT DEFAULT '💰',
    color TEXT DEFAULT '#1976D2',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payment Methods Table
CREATE TABLE payment_methods (
    method_id SERIAL PRIMARY KEY,
    method_name TEXT NOT NULL UNIQUE,
    method_type TEXT CHECK(method_type IN ('নগদ', 'ব্যাংক', 'মোবাইল ব্যাংকিং', 'কার্ড')),
    balance DECIMAL(15,2) DEFAULT 0,
    icon TEXT DEFAULT '💵',
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. Transactions Table
CREATE TABLE transactions (
    transaction_id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_time TIME WITHOUT TIME ZONE DEFAULT CURRENT_TIME,
    account_id INTEGER REFERENCES accounts(account_id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL CHECK(amount > 0),
    description TEXT,
    payment_method_id INTEGER REFERENCES payment_methods(method_id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Performance Indexes
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_payment_method_id ON transactions(payment_method_id);
CREATE INDEX idx_accounts_active ON accounts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = TRUE;

-- 6. Initial Data - Accounts
INSERT INTO accounts (account_name, account_type, category, icon, color) VALUES 
('ঠিকাদারী আয়', 'আয়', 'ব্যবসায়িক', '💼', '#4CAF50'),
('অন্যান্য আয়', 'আয়', 'অন্যান্য', '💰', '#8BC34A'),
('দৈনিক বাজার', 'খরচ', 'পারিবারিক', '🛒', '#FF5722'),
('মুক্তার বাড়ী আনুষঙ্গিক খরচ', 'খরচ', 'পারিবারিক', '🏠', '#795548'),
('বাজারে বাসার আনুষঙ্গিক খরচ', 'খরচ', 'পারিবারিক', '🏡', '#9E9E9E'),
('ইউটিলিটি মুক্তার বাড়ি', 'খরচ', 'পারিবারিক', '⚡', '#FFC107'),
('ইউটিলিটি বাজারে বাসা', 'খরচ', 'পারিবারিক', '💡', '#FFEB3B'),
('ঠিকাদারী ব্যবসা', 'খরচ', 'ব্যবসায়িক', '🏗️', '#2196F3'),
('ঠিকাদারী লাইসেন্স রিনিউয়াল', 'খরচ', 'ব্যবসায়িক', '📋', '#03A9F4'),
('অফিসে স্টেশনারি', 'খরচ', 'ব্যবসায়িক', '📝', '#00BCD4'),
('রাজনৈতিক খরচ', 'খরচ', 'সামাজিক', '🗳️', '#9C27B0'),
('অনুদান', 'খরচ', 'সামাজিক', '🤝', '#E91E63'),
('মেয়র স্যারের খরচ', 'খরচ', 'সামাজিক', '👔', '#F44336'),
('রছি ভাইয়ের খরচ', 'খরচ', 'সামাজিক', '👨', '#FF5722'),
('বেতন', 'খরচ', 'নিয়মিত', '💼', '#607D8B'),
('যাতায়াত খরচ', 'খরচ', 'নিয়মিত', '🚗', '#3F51B5'),
('নাস্তা/আপ্যায়ন', 'খরচ', 'নিয়মিত', '☕', '#FF9800');

-- 7. Initial Data - Payment Methods
INSERT INTO payment_methods (method_name, method_type, balance, icon) VALUES 
('নগদ টাকা', 'নগদ', 0, '💵'),
('ব্যাংক অ্যাকাউন্ট', 'ব্যাংক', 0, '🏦'),
('bKash', 'মোাবাইল ব্যাংকিং', 0, '📱'),
('Nagad', 'মোবাইল ব্যাংকিং', 0, '💳'),
('Rocket', 'মোবাইল ব্যাংকিং', 0, '🚀');

-- 8. Initial Data - Security (Password: Rossy01)
-- SHA-256 for 'Rossy01': 8a9a9c2ce11c758556871868927a46cb8f4d1af7d7cddc5aedeea240176d4878
INSERT INTO security (id, password_hash) VALUES (1, '8a9a9c2ce11c758556871868927a46cb8f4d1af7d7cddc5aedeea240176d4878');

-- 9. Row Level Security (RLS)
ALTER TABLE security ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 10. Policies (Allowing ANON access for the current proxy setup)
-- NOTE: In a production environment, you would restrict these further
CREATE POLICY "Allow public read access to accounts" ON accounts FOR SELECT TO anon USING (is_active = TRUE);
CREATE POLICY "Allow public read access to payment_methods" ON payment_methods FOR SELECT TO anon USING (is_active = TRUE);
CREATE POLICY "Allow public transaction management" ON transactions FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow public login check" ON security FOR SELECT TO anon USING (TRUE);

-- 11. Functions & RPCs
CREATE OR REPLACE FUNCTION update_payment_balance(p_method_id INTEGER, p_amount DECIMAL)
RETURNS void AS $$
BEGIN
    UPDATE payment_methods
    SET balance = balance + p_amount
    WHERE method_id = p_method_id;
END;
$$ LANGUAGE plpgsql;
