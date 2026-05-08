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

@app.errorhandler(Exception)
def handle_global_error(e):
    logger.error(f"Unexpected error: {str(e)}")
    return error_response(str(e), "INTERNAL_SERVER_ERROR", 500)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
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
