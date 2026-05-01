import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.getenv('MONEY_TRACKER_DB_PATH', 'advanced_money_tracker.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Drop and Recreate
    cursor.execute('DROP TABLE IF EXISTS transactions')
    cursor.execute('DROP TABLE IF EXISTS accounts')
    cursor.execute('DROP TABLE IF EXISTS payment_methods')
    cursor.execute('DROP TABLE IF EXISTS budget')
    cursor.execute('DROP TABLE IF EXISTS recurring_templates')
    cursor.execute('DROP TABLE IF EXISTS financial_goals')
    cursor.execute('DROP TABLE IF EXISTS security')

    # Security
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS security (
            id INTEGER PRIMARY KEY,
            password_hash TEXT
        )
    ''')

    # Accounts
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            account_id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL UNIQUE,
            account_type TEXT NOT NULL CHECK(account_type IN ('আয়', 'খরচ')),
            category TEXT,
            icon TEXT DEFAULT '💰',
            color TEXT DEFAULT '#1976D2',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Payment Methods
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payment_methods (
            method_id INTEGER PRIMARY KEY AUTOINCREMENT,
            method_name TEXT NOT NULL UNIQUE,
            method_type TEXT CHECK(method_type IN ('নগদ', 'ব্যাংক', 'মোবাইল ব্যাংকিং', 'কার্ড')),
            balance REAL DEFAULT 0,
            icon TEXT DEFAULT '💵',
            is_active INTEGER DEFAULT 1
        )
    ''')

    # Transactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_date TEXT NOT NULL,
            transaction_time TEXT,
            account_id INTEGER NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            description TEXT,
            payment_method_id INTEGER,
            is_deleted INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(account_id),
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(method_id)
        )
    ''')

    # Initial Data
    accounts_data = [
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
        ('নাস্তা/আপ্যায়ন', 'খরচ', 'নিয়মিত', '☕', '#FF9800')
    ]
    cursor.executemany(
        'INSERT INTO accounts (account_name, account_type, category, icon, color) VALUES (?, ?, ?, ?, ?)',
        accounts_data
    )

    payment_methods = [
        ('নগদ টাকা', 'নগদ', 0, '💵'),
        ('ব্যাংক অ্যাকাউন্ট', 'ব্যাংক', 0, '🏦'),
        ('bKash', 'মোবাইল ব্যাংকিং', 0, '📱'),
        ('Nagad', 'মোবাইল ব্যাংকিং', 0, '💳'),
        ('Rocket', 'মোবাইল ব্যাংকিং', 0, '🚀')
    ]
    cursor.executemany(
        'INSERT INTO payment_methods (method_name, method_type, balance, icon) VALUES (?, ?, ?, ?)',
        payment_methods
    )

    # Default Password: admin (or 010987 as before)
    password = "admin"
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    cursor.execute('INSERT INTO security (id, password_hash) VALUES (1, ?)', (password_hash,))

    conn.commit()
    conn.close()
    print("Database standardized and initialized.")

if __name__ == "__main__":
    init_db()
