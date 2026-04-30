import sqlite3
import os
from datetime import datetime
import logging
from drive_sync import GoogleDriveSync

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.getenv('MONEY_TRACKER_DB_PATH', 'advanced_money_tracker.db')

def get_db_connection():
    # When running via MCP toolbox, we need to ensure the DB path is correct
    # If DB_PATH is relative, it will be relative to where the toolbox is run.
    # We'll use the absolute path if possible or assume it's in the current dir.
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_accounts():
    """Lists all accounts in the Money Tracker database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT account_id, account_name, account_type, category FROM accounts WHERE is_active = 1')
        accounts = [dict(row) for row in cursor.fetchall()]
        return accounts
    except Exception as e:
        logger.error(f"Error fetching accounts: {e}")
        return []
    finally:
        conn.close()

def get_payment_methods():
    """Lists all payment methods in the Money Tracker database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT method_id, method_name, method_type, balance FROM payment_methods WHERE is_active = 1')
        methods = [dict(row) for row in cursor.fetchall()]
        return methods
    except Exception as e:
        logger.error(f"Error fetching payment methods: {e}")
        return []
    finally:
        conn.close()

def upload_money_tracker_db():
    """Uploads the Money Tracker database file to Google Drive."""
    sync = GoogleDriveSync(DB_PATH, logger)
    if sync.service:
        return sync.upload_db_file()
    else:
        logger.error("Failed to initialize Google Drive sync. service is None.")
        return False

def download_money_tracker_db():
    """Downloads the Money Tracker database file from Google Drive."""
    sync = GoogleDriveSync(DB_PATH, logger)
    if sync.service:
        return sync.download_db_file()
    else:
        logger.error("Failed to initialize Google Drive sync. service is None.")
        return False

def add_new_transaction(account_id, amount, description, transaction_date=None, payment_method_id=None):
    """Adds a new transaction to the Money Tracker database."""
    if not transaction_date:
        transaction_date = datetime.now().strftime('%Y-%m-%d')
    transaction_time = datetime.now().strftime('%H:%M')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO transactions (transaction_date, transaction_time, account_id, amount, description, payment_method_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (transaction_date, transaction_time, account_id, amount, description, payment_method_id))
        
        # Fetch account type to update balance
        cursor.execute('SELECT account_type FROM accounts WHERE account_id = ?', (account_id,))
        row = cursor.fetchone()
        if not row:
            logger.error(f"Account ID {account_id} not found.")
            return False
        
        account_type = row[0]
        
        if payment_method_id:
            if account_type == 'আয়':
                cursor.execute('UPDATE payment_methods SET balance = balance + ? WHERE method_id = ?', (amount, payment_method_id))
            else:
                cursor.execute('UPDATE payment_methods SET balance = balance - ? WHERE method_id = ?', (amount, payment_method_id))
        
        conn.commit()
        logger.info("Transaction added successfully.")
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"Error adding transaction: {e}")
        return False
    finally:
        conn.close()

def get_money_tracker_report_summary(start_date, end_date):
    """Generates a summary report of transactions for a given date range."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT a.account_type, SUM(t.amount) as total
            FROM transactions t
            JOIN accounts a ON t.account_id = a.account_id
            WHERE t.transaction_date BETWEEN ? AND ? AND t.is_deleted = 0
            GROUP BY a.account_type
        ''', (start_date, end_date))
        summary = {row[0]: row[1] for row in cursor.fetchall()}
        # Ensure both 'আয়' and 'খরচ' keys exist
        summary.setdefault('আয়', 0.0)
        summary.setdefault('খরচ', 0.0)
        summary['balance'] = summary['আয়'] - summary['খরচ']
        return summary
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        return {}
    finally:
        conn.close()
