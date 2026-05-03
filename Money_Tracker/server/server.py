import os
import logging
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
# Security Best Practice: Strict CORS
CORS(app, supports_credentials=True)

# NOTE: This Flask server is now mostly legacy as the React client 
# communicates with Supabase directly for better performance and security (RLS).

@app.errorhandler(Exception)
def handle_global_error(e):
    logger.error(f"Unexpected error: {str(e)}")
    if "42501" in str(e):
        return error_response("Permission Denied: RLS violation", "FORBIDDEN", 403)
    return error_response(str(e), "INTERNAL_SERVER_ERROR", 500)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "architecture": "Hybrid (Direct Supabase + Flask Proxy)"})

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """
    Legacy endpoint. Note: Balance updates are now handled by 
    PostgreSQL Triggers in the database.
    """
    data = request.get_json()
    try:
        supabase = get_supabase_client()
        response = supabase.table("transactions").insert({
            "account_id": data['account_id'],
            "amount": float(data['amount']),
            "description": data.get('description', ''),
            "payment_method_id": data.get('payment_method_id'),
            "transaction_date": data.get('transaction_date', datetime.now().strftime('%Y-%m-%d')),
            "transaction_time": data.get('transaction_time', datetime.now().strftime('%H:%M'))
        }).execute()
        
        return success_response(response.data[0], 201)
    except Exception as e:
        return error_response(str(e), "CREATE_FAILED", 400)

if __name__ == '__main__':
    app.run(port=int(os.environ.get("PORT", 5000)))
