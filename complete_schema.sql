-- COMPLETE DATABASE SCHEMA for Money Footprint Lite
-- Run this in the Supabase SQL Editor to ensure all "Internal Functions" work.

-- 1. Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  amount decimal NOT NULL,
  type text CHECK (type IN ('income', 'expense')),
  category_name text,
  method text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone DEFAULT now(),
  currency text DEFAULT 'BDT'
);

-- 2. Accounts (Assets)
CREATE TABLE IF NOT EXISTS accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  type text DEFAULT 'Bank', -- Bank, Cash, Mobile
  balance decimal DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Debts (Liabilities)
CREATE TABLE IF NOT EXISTS debts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  balance decimal DEFAULT 0,
  due_date date,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  category_name text NOT NULL,
  amount decimal NOT NULL,
  UNIQUE(user_id, category_name)
);

-- 5. Recurring Transactions
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  amount decimal NOT NULL,
  type text,
  category_name text,
  next_date integer, -- Day of month
  is_active boolean DEFAULT true
);

-- 6. Financial Targets (Estimates)
CREATE TABLE IF NOT EXISTS financial_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  target_name text NOT NULL,
  amount decimal NOT NULL,
  target_type text DEFAULT 'estimate',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
