const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const waitOn = require('wait-on');

const TEST_DB_PATH = path.join(__dirname, 'e2e-test.db');

// Database schema from advanced_money_tracker.py
const SCHEMA = `
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
`;

test.describe('Money Tracker E2E', () => {
  let backendServer;
  let frontendServer;
  let db;

  test.beforeAll(async () => {
    // Kill any processes that might be lingering on the ports we need
    try {
        execSync('kill $(lsof -t -i:3001) 2>/dev/null');
        execSync('kill $(lsof -t -i:5000) 2>/dev/null');
    } catch (error) {
        // Ignore errors if no processes are running
    }

    // Clean up old test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    // Create and populate the test database
    db = new sqlite3.Database(TEST_DB_PATH);
    await new Promise((resolve, reject) => {
        db.exec(SCHEMA, (err) => {
            if (err) return reject(err);
            const password = 'testpassword';
            const password_hash = crypto.createHash('sha256').update(password).digest('hex');
            db.run('INSERT INTO security (id, password_hash) VALUES (1, ?)', [password_hash], (err) => {
                if (err) return reject(err);
                const accounts_data = [
                    ['Test Income', 'आय', 'Test', '💰', '#4CAF50', 1],
                    ['Test Expense', 'খরচ', 'Test', '💸', '#F44336', 1],
                ];
                const stmt = db.prepare('INSERT INTO accounts (account_name, account_type, category, icon, color, is_active) VALUES (?, ?, ?, ?, ?, ?)');
                for (const row of accounts_data) {
                    stmt.run(row);
                }
                stmt.finalize(resolve);
            });
        });
    });

    // Start the Python backend server with the test database
    backendServer = spawn('python', ['server.py'], {
      env: { ...process.env, MONEY_TRACKER_DB_PATH: TEST_DB_PATH },
      stdio: 'inherit',
      detached: true,
    });

    // Start the React frontend server
    frontendServer = spawn('npm', ['start'], {
      cwd: 'client',
      stdio: 'inherit',
      detached: true,
    });

    // Wait for the servers to be ready
    await waitOn({ resources: ['http://localhost:3001', 'http-get://localhost:5000/api/health'] });
  });

  test.afterAll(async () => {
    process.kill(-backendServer.pid);
    process.kill(-frontendServer.pid);
    db.close();
    fs.unlinkSync(TEST_DB_PATH);
  });

  test('full user flow: login, add transaction, verify', async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.fill('input#password', 'testpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1:has-text("Office Expense Tracker")')).toBeVisible({ timeout: 15000 });
    await page.selectOption('select', { label: 'Test Expense' });
    await page.fill('input[placeholder="Description"]', 'Test E2E Transaction');
    await page.fill('input[placeholder="Amount"]', '123.45');
    await page.click('button:has-text("Add Transaction")');
    await expect(page.locator('text=Test E2E Transaction')).toBeVisible();
    await expect(page.locator('text=123.45')).toBeVisible();
  });
});
