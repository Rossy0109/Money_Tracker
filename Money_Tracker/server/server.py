import os
import hashlib
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
from backend_utils import (
    get_supabase_client, 
    logger, 
    success_response, 
    error_response
)

app = Flask(__name__)
# Security Best Practice: Use credentials only if necessary, strictly define allowed origins
CORS(app, supports_credentials=True)

# Central Error Handling for RLS and Supabase Errors
@app.errorhandler(Exception)
def handle_global_error(e):
    logger.error(f"Unexpected error: {str(e)}")
    if "42501" in str(e):
        return error_response("Permission Denied: RLS violation", "FORBIDDEN", 403)
    return error_response(str(e), "INTERNAL_SERVER_ERROR", 500)

@app.route('/api/health', methods=['GET'])
def health():
    try:
        supabase = get_supabase_client()
        return jsonify({"status": "healthy", "database": "connected"})
    except:
        return jsonify({"status": "degraded", "database": "disconnected"}), 503

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    password = data.get('password')
    if not password:
        return error_response("Password required", "BAD_REQUEST", 400)
        
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    try:
        supabase = get_supabase_client()
        response = supabase.table("security").select("*").eq("password_hash", password_hash).execute()
        if len(response.data) > 0:
            return success_response({"message": "Login successful"})
        else:
            return error_response("Invalid password", "UNAUTHORIZED", 401)
    except Exception as e:
        return error_response(str(e))

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    try:
        supabase = get_supabase_client()
        response = supabase.table("accounts").select("*").eq("is_active", True).execute()
        return jsonify(response.data) # Client expects raw array for now
    except Exception as e:
        return error_response(str(e))

@app.route('/api/payment_methods', methods=['GET'])
def get_payment_methods():
    try:
        supabase = get_supabase_client()
        response = supabase.table("payment_methods").select("*").eq("is_active", True).execute()
        return jsonify(response.data)
    except Exception as e:
        return error_response(str(e))

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    try:
        supabase = get_supabase_client()
        response = supabase.table("transactions") \
            .select("*, accounts(account_name, account_type, category), payment_methods(method_name)") \
            .eq("is_deleted", False) \
            .order("transaction_date", desc=True) \
            .order("transaction_time", desc=True) \
            .limit(100) \
            .execute()
        
        transactions = []
        for row in response.data:
            tx = row.copy()
            tx['id'] = row['transaction_id']
            tx['account_name'] = row['accounts']['account_name'] if row['accounts'] else 'N/A'
            tx['account_type'] = row['accounts']['account_type'] if row['accounts'] else 'N/A'
            tx['category'] = row['accounts']['category'] if row['accounts'] else 'N/A'
            tx['payment_method'] = row['payment_methods']['method_name'] if row['payment_methods'] else None
            transactions.append(tx)
            
        return jsonify(transactions)
    except Exception as e:
        return error_response(str(e))

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = request.get_json()
    try:
        supabase = get_supabase_client()
        account_id = data['account_id']
        amount = float(data['amount'])
        payment_method_id = data.get('payment_method_id')
        
        # 1. Fetch account type
        account = supabase.table("accounts").select("account_type").eq("account_id", account_id).single().execute()
        account_type = account.data['account_type']

        # 2. Insert
        response = supabase.table("transactions").insert({
            "account_id": account_id,
            "amount": amount,
            "description": data.get('description', ''),
            "payment_method_id": payment_method_id,
            "transaction_date": data.get('transaction_date', datetime.now().strftime('%Y-%m-%d')),
            "transaction_time": data.get('transaction_time', datetime.now().strftime('%H:%M'))
        }).execute()
        
        new_tx = response.data[0]
        new_tx['id'] = new_tx['transaction_id']

        # 3. Atomic Balance Update
        if payment_method_id:
            balance_change = amount if account_type == 'আয়' else -amount
            supabase.rpc("update_payment_balance", {
                "p_method_id": payment_method_id,
                "p_amount": balance_change
            }).execute()

        return success_response(new_tx, 201)
    except Exception as e:
        return error_response(str(e), "CREATE_FAILED", 400)

@app.route('/api/transactions/<int:tx_id>', methods=['PUT'])
def update_transaction(tx_id):
    data = request.get_json()
    try:
        supabase = get_supabase_client()
        supabase.table("transactions").update({
            "amount": float(data['amount']),
            "description": data.get('description', ''),
            "transaction_date": data.get('transaction_date'),
            "account_id": data.get('account_id'),
            "payment_method_id": data.get('payment_method_id')
        }).eq("transaction_id", tx_id).execute()
        
        return success_response({"message": "Updated"})
    except Exception as e:
        return error_response(str(e), "UPDATE_FAILED", 400)

@app.route('/api/summary/weekly', methods=['GET'])
def get_weekly_summary():
    try:
        supabase = get_supabase_client()
        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        response = supabase.table("transactions") \
            .select("amount, accounts(account_type)") \
            .gte("transaction_date", seven_days_ago) \
            .eq("is_deleted", False) \
            .execute()
        
        total_expense = sum(row['amount'] for row in response.data if row['accounts'] and row['accounts']['account_type'] == 'খরচ')

        return jsonify({
            'weeklyExpense': total_expense
        })
    except Exception as e:
        return error_response(str(e))

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    try:
        supabase = get_supabase_client()
        supabase.table("transactions").update({"is_deleted": True}).eq("transaction_id", tx_id).execute()
        return success_response({"message": "Deleted"})
    except Exception as e:
        return error_response(str(e), "DELETE_FAILED", 400)

@app.route('/api/summary/daily', methods=['GET'])
def get_daily_summary():
    try:
        supabase = get_supabase_client()
        today = datetime.now().strftime('%Y-%m-%d')
        response = supabase.table("transactions") \
            .select("amount, accounts(account_type)") \
            .eq("transaction_date", today) \
            .eq("is_deleted", False) \
            .execute()
        
        total_income = sum(row['amount'] for row in response.data if row['accounts'] and row['accounts']['account_type'] == 'আয়')
        total_expense = sum(row['amount'] for row in response.data if row['accounts'] and row['accounts']['account_type'] == 'খরচ')

        return jsonify({
            'totalIncome': total_income,
            'totalExpense': total_expense,
            'balance': total_income - total_expense
        })
    except Exception as e:
        return error_response(str(e))

if __name__ == '__main__':
    # Flask default port is 5000
    app.run(port=int(os.environ.get("PORT", 5000)))
