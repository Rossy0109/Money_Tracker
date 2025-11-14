import sqlite3
import os
import hashlib
from flask import Flask, request, jsonify, session
from datetime import datetime, timedelta
from flask_cors import CORS
import secrets

class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = None
        self.cursor = None

    def connect(self):
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.cursor = self.conn.cursor()

    def close(self):
        if self.conn:
            self.conn.close()

class FlaskAPI:
    def __init__(self, db):
        self.app = Flask(__name__)
        self.app.secret_key = secrets.token_hex(16)
        CORS(self.app, supports_credentials=True)
        self.db = db
        self.setup_routes()

    def setup_routes(self):
        @self.app.before_request
        def before_request():
            if request.endpoint not in ['login', 'static']:
                if 'user_id' not in session:
                    return jsonify({"message": "Unauthorized"}), 401

        @self.app.route('/api/login', methods=['POST'])
        def login():
            data = request.get_json()
            password = data['password']
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            self.db.cursor.execute('SELECT id, password_hash FROM security WHERE id = 1')
            user = self.db.cursor.fetchone()
            if user and user[1] == password_hash:
                session['user_id'] = user[0]
                return jsonify({"message": "Login successful"})
            return jsonify({"message": "Invalid credentials"}), 401

        @self.app.route('/api/accounts', methods=['GET'])
        def get_accounts():
            self.db.cursor.execute('SELECT account_id, account_name, account_type, category FROM accounts WHERE is_active = 1')
            accounts = [{'account_id': row[0], 'account_name': row[1], 'account_type': row[2], 'category': row[3]} for row in self.db.cursor.fetchall()]
            return jsonify(accounts)

        @self.app.route('/api/transactions', methods=['GET'])
        def get_transactions():
            self.db.cursor.execute('''
                SELECT t.transaction_id, t.transaction_date, t.transaction_time, a.account_name, a.account_type, t.amount, t.description, a.category
                FROM transactions t
                JOIN accounts a ON t.account_id = a.account_id
                WHERE t.is_deleted = 0
                ORDER BY t.transaction_date DESC, t.transaction_time DESC
            ''')
            transactions = []
            for row in self.db.cursor.fetchall():
                transactions.append({
                    'id': row[0],
                    'transaction_date': row[1],
                    'transaction_time': row[2],
                    'account_name': row[3],
                    'account_type': row[4],
                    'amount': row[5],
                    'description': row[6],
                    'category': row[7]
                })
            return jsonify(transactions)

        @self.app.route('/api/transactions', methods=['POST'])
        def add_transaction():
            data = request.get_json()
            account_id = data['account_id']
            amount = data['amount']
            description = data['description']
            transaction_date = data.get('transaction_date', datetime.now().strftime('%Y-%m-%d'))
            transaction_time = data.get('transaction_time', datetime.now().strftime('%H:%M'))

            self.db.cursor.execute('''
                INSERT INTO transactions (transaction_date, transaction_time, account_id, amount, description)
                VALUES (?, ?, ?, ?, ?)
            ''', (transaction_date, transaction_time, account_id, amount, description))
            self.db.conn.commit()

            # Update payment method balance (assuming payment_method_id is passed in data)
            payment_method_id = data.get('payment_method_id')
            if payment_method_id:
                account_type = data.get('account_type') # Need account_type to determine if income or expense
                if account_type == 'আয়':
                    self.db.cursor.execute('UPDATE payment_methods SET balance = balance + ? WHERE method_id = ?', (amount, payment_method_id))
                elif account_type == 'খরচ':
                    self.db.cursor.execute('UPDATE payment_methods SET balance = balance - ? WHERE method_id = ?', (amount, payment_method_id))
                self.db.conn.commit()

            # Fetch the newly added transaction to return it
            self.db.cursor.execute('SELECT last_insert_rowid()')
            new_id = self.db.cursor.fetchone()[0]

            self.db.cursor.execute('''
                SELECT t.transaction_id, t.transaction_date, t.transaction_time, a.account_name, a.account_type, t.amount, t.description, a.category
                FROM transactions t
                JOIN accounts a ON t.account_id = a.account_id
                WHERE t.transaction_id = ?
            ''', (new_id,))
            new_transaction = self.db.cursor.fetchone()

            return jsonify({
                'id': new_transaction[0],
                'transaction_date': new_transaction[1],
                'transaction_time': new_transaction[2],
                'account_name': new_transaction[3],
                'account_type': new_transaction[4],
                'amount': new_transaction[5],
                'description': new_transaction[6],
                'category': new_transaction[7]
            }), 201

        @self.app.route('/api/transactions/<int:id>', methods=['PUT'])
        def update_transaction(id):
            data = request.get_json()
            account_id = data['account_id']
            amount = data['amount']
            description = data['description']
            transaction_date = data.get('transaction_date', datetime.now().strftime('%Y-%m-%d'))
            transaction_time = data.get('transaction_time', datetime.now().strftime('%H:%M'))
            self.db.cursor.execute('''
                UPDATE transactions
                SET transaction_date = ?, transaction_time = ?, account_id = ?, amount = ?, description = ?
                WHERE transaction_id = ?
            ''', (transaction_date, transaction_time, account_id, amount, description, id))
            self.db.conn.commit()
            return jsonify({'message': 'Transaction updated successfully'})

        @self.app.route('/api/transactions/<int:id>', methods=['DELETE'])
        def delete_transaction(id):
            # Before deleting, get transaction details to revert payment method balance
            self.db.cursor.execute('SELECT amount, account_id, payment_method_id FROM transactions WHERE transaction_id = ?', (id,))
            transaction_details = self.db.cursor.fetchone()

            if transaction_details:
                amount, account_id, payment_method_id = transaction_details
                self.db.cursor.execute('SELECT account_type FROM accounts WHERE account_id = ?', (account_id,))
                account_type = self.db.cursor.fetchone()[0]

                if payment_method_id:
                    if account_type == 'আয়':
                        self.db.cursor.execute('UPDATE payment_methods SET balance = balance - ? WHERE method_id = ?', (amount, payment_method_id))
                    elif account_type == 'খরচ':
                        self.db.cursor.execute('UPDATE payment_methods SET balance = balance + ? WHERE method_id = ?', (amount, payment_method_id))
                    self.db.conn.commit()

            self.db.cursor.execute('UPDATE transactions SET is_deleted = 1 WHERE transaction_id = ?', (id,))
            self.db.conn.commit()
            return '', 204

        @self.app.route('/api/summary/daily', methods=['GET'])
        def get_daily_summary():
            today = datetime.now().strftime('%Y-%m-%d')
            self.db.cursor.execute('''
                SELECT a.account_type, SUM(t.amount)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.account_id
                WHERE t.transaction_date = ? AND t.is_deleted = 0
                GROUP BY a.account_type
            ''', (today,))
            summary_data = self.db.cursor.fetchall()

            total_income = sum(row[1] for row in summary_data if row[0] == 'আয়')
            total_expense = sum(row[1] for row in summary_data if row[0] == 'খরচ')

            return jsonify({
                'totalIncome': total_income,
                'totalExpense': total_expense,
                'balance': total_income - total_expense
            })

        @self.app.route('/api/summary/weekly', methods=['GET'])
        def get_weekly_summary():
            now = datetime.now()
            day_of_week = now.weekday() # Monday is 0, Sunday is 6
            start_of_week = now - timedelta(days=day_of_week)
            start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_week = start_of_week + timedelta(days=6)
            end_of_week = end_of_week.replace(hour=23, minute=59, second=59, microsecond=999999)

            self.db.cursor.execute('''
                SELECT SUM(t.amount)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.account_id
                WHERE t.transaction_date BETWEEN ? AND ? AND a.account_type = 'খরচ' AND t.is_deleted = 0
            ''', (start_of_week.strftime('%Y-%m-%d'), end_of_week.strftime('%Y-%m-%d')))
            weekly_expense = self.db.cursor.fetchone()[0] or 0

            return jsonify({'weeklyExpense': weekly_expense})
    def run(self):
        self.app.run(port=5000)

if __name__ == '__main__':
    db_path = os.getenv('MONEY_TRACKER_DB_PATH', 'advanced_money_tracker.db')
    db = Database(db_path)
    db.connect()

    api = FlaskAPI(db)
    api.run()
