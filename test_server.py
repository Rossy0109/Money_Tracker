# -*- coding: utf-8 -*-
import pytest
import tempfile
import os
import hashlib
from server import FlaskAPI, Database

# Database schema from advanced_money_tracker.py
SCHEMA = """
CREATE TABLE accounts (
    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL UNIQUE,
    account_type TEXT NOT NULL CHECK(account_type IN ('आय', 'খরচ')),
    category TEXT,
    icon TEXT DEFAULT '💰',
    color TEXT DEFAULT '#1976D2',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payment_methods (
    method_id INTEGER PRIMARY KEY AUTOINCREMENT,
    method_name TEXT NOT NULL UNIQUE,
    method_type TEXT CHECK(method_type IN ('নগদ', 'ব্যাংক', 'মোবাইল ব্যাংকিং', 'কার্ড')),
    balance REAL DEFAULT 0,
    icon TEXT DEFAULT '💵',
    is_active INTEGER DEFAULT 1
);
CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    transaction_time TEXT,
    account_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT,
    voucher_no TEXT UNIQUE,
    payment_method_id INTEGER,
    receipt_path TEXT,
    is_recurring INTEGER DEFAULT 0,
    tags TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(method_id)
);
CREATE TABLE budget (
    budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    budgeted_amount REAL NOT NULL,
    alert_threshold REAL DEFAULT 90,
    UNIQUE(account_id, month),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);
CREATE TABLE recurring_templates (
    template_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    payment_method_id INTEGER,
    amount REAL NOT NULL,
    description TEXT,
    frequency TEXT CHECK(frequency IN ('দৈনিক', 'সাপ্তাহিক', 'মাসিক', 'বার্ষিক')),
    day_of_month INTEGER,
    is_active INTEGER DEFAULT 1,
    next_date TEXT,
    last_created TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);
CREATE TABLE financial_goals (
    goal_id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    deadline TEXT,
    category TEXT,
    icon TEXT DEFAULT '🎯',
    is_achieved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE security (
    id INTEGER PRIMARY KEY,
    password_hash TEXT,
    security_question TEXT,
    security_answer_hash TEXT
);
"""

@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp()

    database = Database(db_path)
    database.connect()

    # Create the database schema
    cursor = database.conn.cursor()
    cursor.executescript(SCHEMA)

    # Add a test user
    password = 'testpassword'
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    cursor.execute('INSERT INTO security (id, password_hash) VALUES (1, ?)', (password_hash,))

    # Add some test accounts
    accounts_data = [
        ('Test Income', 'आय', 'Test', '💰', '#4CAF50', 1),
        ('Test Expense', 'খরচ', 'Test', '💸', '#F44336', 1),
    ]
    cursor.executemany(
        'INSERT INTO accounts (account_name, account_type, category, icon, color, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        accounts_data
    )
    database.conn.commit()

    api = FlaskAPI(database)
    app = api.app
    app.config.update({
        "TESTING": True,
    })

    yield app

    database.close()
    os.close(db_fd)
    os.unlink(db_path)

@pytest.fixture
def client(app):
    return app.test_client()

def login(client, password='testpassword'):
    """Helper function to log in a user."""
    return client.post('/api/login', json={'password': password})

def test_login_success(client):
    """Test successful login."""
    rv = login(client)
    json_data = rv.get_json()
    assert rv.status_code == 200
    assert json_data['message'] == 'Login successful'

def test_login_failure(client):
    """Test failed login with wrong password."""
    rv = login(client, 'wrongpassword')
    json_data = rv.get_json()
    assert rv.status_code == 401
    assert json_data['message'] == 'Invalid credentials'

def test_get_accounts_unauthorized(client):
    """Test that /api/accounts requires login."""
    rv = client.get('/api/accounts')
    assert rv.status_code == 401

def test_get_accounts_authorized(client):
    """Test that /api/accounts returns accounts after login."""
    login(client)
    rv = client.get('/api/accounts')
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert isinstance(json_data, list)
    assert len(json_data) == 2
    assert json_data[0]['account_name'] == 'Test Income'
    assert json_data[1]['account_name'] == 'Test Expense'
