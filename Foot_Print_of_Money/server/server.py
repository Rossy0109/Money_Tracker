import os
import logging
import io
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timedelta
from backend_utils import (
    get_supabase_client, 
    logger, 
    success_response, 
    error_response,
    generate_report_pdf,
    MockBankProvider
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

@app.route('/api/reports/pdf', methods=['GET'])
def get_pdf_report():
    user_id = request.args.get('user_id')
    if not user_id:
        return error_response("user_id is required", "MISSING_PARAM", 400)
    
    try:
        supabase = get_supabase_client()
        # Fetch last 50 transactions for the report
        response = supabase.table("transactions") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("occurred_at", desc=True) \
            .limit(50) \
            .execute()
        
        pdf_content = generate_report_pdf(response.data)
        
        return send_file(
            io.BytesIO(pdf_content),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"report_{datetime.now().strftime('%Y%m%d')}.pdf"
        )
    except Exception as e:
        return error_response(str(e), "REPORT_GEN_FAILED", 500)

@app.route('/api/sync/mock-bank', methods=['POST'])
def sync_mock_bank():
    data = request.get_json()
    user_id = data.get('user_id')
    account_id = data.get('account_id')
    
    if not user_id or not account_id:
        return error_response("user_id and account_id are required", "MISSING_PARAM", 400)
    
    try:
        supabase = get_supabase_client()
        mock_transactions = MockBankProvider.fetch_transactions(5)
        
        # Add user/account info to mock data
        for t in mock_transactions:
            t['user_id'] = user_id
            t['account_id'] = account_id
            
        response = supabase.table("transactions").insert(mock_transactions).execute()
        
        return success_response({
            "message": f"Successfully synced {len(response.data)} transactions from Mock Bank",
            "transactions": response.data
        }, 201)
    except Exception as e:
        return error_response(str(e), "SYNC_FAILED", 500)

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
