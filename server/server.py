import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime, timedelta
import logging
import hashlib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True)

# Central Error Handling for RLS and Supabase Errors
@app.errorhandler(Exception)
def handle_error(e):
    logger.error(f"Error occurred: {str(e)}")
    # Check for Postgres RLS error code 42501 (insufficient_privilege) in the exception message
    if "42501" in str(e):
        return jsonify({
            "error": "Permission Denied",
            "message": "Row Level Security (RLS) policy violation. You do not have permission to perform this action."
        }), 403
    return jsonify({
        "error": "Internal Server Error",
        "message": str(e)
    }), 500

# Supabase Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

def check_supabase():
    if not supabase:
        return jsonify({"message": "Supabase credentials missing"}), 500
    return None

@app.route('/api/login', methods=['POST'])
def login():
    err = check_supabase()
    if err: return err
    
    data = request.get_json()
    password = data.get('password')
    if not password:
        return jsonify({"message": "Password required"}), 400
        
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    response = supabase.table("security").select("*").eq("password_hash", password_hash).execute()
    
    if len(response.data) > 0:
        return jsonify({"message": "Login successful"}), 200
    else:
        return jsonify({"message": "Invalid password"}), 401

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "database": "supabase" if supabase else "missing"})

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    err = check_supabase()
    if err: return err
    
    response = supabase.table("accounts").select("*").eq("is_active", True).execute()
    return jsonify(response.data)

@app.route('/api/payment_methods', methods=['GET'])
def get_payment_methods():
    err = check_supabase()
    if err: return err
    
    response = supabase.table("payment_methods").select("*").eq("is_active", True).execute()
    return jsonify(response.data)

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    err = check_supabase()
    if err: return err
    
    response = supabase.table("transactions") \
        .select("*, accounts(account_name, account_type, category), payment_methods(method_name)") \
        .eq("is_deleted", False) \
        .order("transaction_date", desc=True) \
        .order("transaction_time", desc=True) \
        .limit(100) \
        .execute()
    
    # Flatten response for frontend compatibility
    transactions = []
    for row in response.data:
        tx = row.copy()
        tx['id'] = row['transaction_id'] # Standardize ID field for React
        tx['account_name'] = row['accounts']['account_name']
        tx['account_type'] = row['accounts']['account_type']
        tx['category'] = row['accounts']['category']
        tx['payment_method'] = row['payment_methods']['method_name'] if row['payment_methods'] else None
        transactions.append(tx)
        
    return jsonify(transactions)

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    err = check_supabase()
    if err: return err
    
    data = request.get_json()
    try:
        account_id = data['account_id']
        amount = float(data['amount'])
        payment_method_id = data.get('payment_method_id')
        
        # Get account type for balance update
        account = supabase.table("accounts").select("account_type").eq("account_id", account_id).single().execute()
        account_type = account.data['account_type']

        # Insert transaction
        response = supabase.table("transactions").insert({
            "account_id": account_id,
            "amount": amount,
            "description": data.get('description', ''),
            "payment_method_id": payment_method_id,
            "transaction_date": data.get('transaction_date', datetime.now().strftime('%Y-%m-%d')),
            "transaction_time": data.get('transaction_time', datetime.now().strftime('%H:%M'))
        }).execute()
        
        # Standardize ID for response
        new_tx = response.data[0]
        new_tx['id'] = new_tx['transaction_id']

        # Update balance
        if payment_method_id:
            balance_change = amount if account_type == 'আয়' else -amount
            supabase.rpc("update_payment_balance", {
                "p_method_id": payment_method_id,
                "p_amount": balance_change
            }).execute()

        return jsonify(new_tx), 201
    except Exception as e:
        return jsonify({"message": str(e)}), 400

@app.route('/api/transactions/<int:tx_id>', methods=['PUT'])
def update_transaction(tx_id):
    err = check_supabase()
    if err: return err
    
    data = request.get_json()
    try:
        supabase.table("transactions").update({
            "amount": float(data['amount']),
            "description": data.get('description', ''),
            "transaction_date": data.get('transaction_date'),
            "account_id": data.get('account_id'),
            "payment_method_id": data.get('payment_method_id')
        }).eq("transaction_id", tx_id).execute()
        
        return jsonify({"message": "Updated"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 400

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    err = check_supabase()
    if err: return err
    
    try:
        # Soft delete
        supabase.table("transactions").update({"is_deleted": True}).eq("transaction_id", tx_id).execute()
        return jsonify({"message": "Deleted"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 400

@app.route('/api/summary/daily', methods=['GET'])
def get_daily_summary():
    err = check_supabase()
    if err: return err
    
    today = datetime.now().strftime('%Y-%m-%d')
    response = supabase.table("transactions") \
        .select("amount, accounts(account_type)") \
        .eq("transaction_date", today) \
        .eq("is_deleted", False) \
        .execute()
    
    total_income = sum(r['amount'] for row in response.data if (r := row) and row['accounts']['account_type'] == 'আয়')
    total_expense = sum(r['amount'] for row in response.data if (r := row) and row['accounts']['account_type'] == 'খরচ')

    return jsonify({
        'totalIncome': total_income,
        'totalExpense': total_expense,
        'balance': total_income - total_expense
    })

@app.route('/api/summary/weekly', methods=['GET'])
def get_weekly_summary():
    err = check_supabase()
    if err: return err
    
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    response = supabase.table("transactions") \
        .select("amount, accounts(account_type)") \
        .gte("transaction_date", seven_days_ago) \
        .eq("is_deleted", False) \
        .execute()
    
    total_expense = sum(r['amount'] for row in response.data if (r := row) and row['accounts']['account_type'] == 'খরচ')

    return jsonify({
        'weeklyExpense': total_expense
    })

# Main entry for Vercel
app.debug = False
if __name__ == '__main__':
    app.run()
