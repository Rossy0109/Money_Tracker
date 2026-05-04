import os
import json
from datetime import datetime
from backend_utils import (
    get_supabase_client, 
    logger, 
    success_response, 
    error_response
)
from drive_sync import GoogleDriveSync

def get_accounts():
    """Lists all active accounts in the Foot Print of Money (Supabase)."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("accounts").select("*").eq("is_active", True).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching accounts: {e}")
        return []

def get_payment_methods():
    """Lists all active payment methods in the Foot Print of Money (Supabase)."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("payment_methods").select("*").eq("is_active", True).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching payment methods: {e}")
        return []

def add_new_transaction(account_id, amount, description, transaction_date=None, payment_method_id=None):
    """Adds a new transaction to Supabase and updates the payment balance."""
    if not transaction_date:
        transaction_date = datetime.now().strftime('%Y-%m-%d')
    transaction_time = datetime.now().strftime('%H:%M')
    
    try:
        supabase = get_supabase_client()
        # 1. Get account type
        account = supabase.table("accounts").select("account_type").eq("account_id", account_id).single().execute()
        if not account.data:
            logger.error(f"Account ID {account_id} not found.")
            return False
        account_type = account.data['account_type']

        # 2. Insert transaction
        supabase.table("transactions").insert({
            "account_id": account_id,
            "amount": float(amount),
            "description": description,
            "payment_method_id": payment_method_id,
            "transaction_date": transaction_date,
            "transaction_time": transaction_time
        }).execute()
        
        # 3. Update balance via RPC
        if payment_method_id:
            balance_change = float(amount) if account_type == 'আয়' else -float(amount)
            supabase.rpc("update_payment_balance", {
                "p_method_id": payment_method_id,
                "p_amount": balance_change
            }).execute()

        logger.info("Transaction added to Supabase successfully via MCP tool.")
        return True
    except Exception as e:
        logger.error(f"Error adding transaction to Supabase: {e}")
        return False

def get_foot_print_of_money_report_summary(start_date, end_date):
    """Generates a summary report of transactions for a given date range (Supabase)."""
    try:
        supabase = get_supabase_client()
        response = supabase.table("transactions") \
            .select("amount, accounts(account_type)") \
            .gte("transaction_date", start_date) \
            .lte("transaction_date", end_date) \
            .eq("is_deleted", False) \
            .execute()
        
        income = sum(row['amount'] for row in response.data if row['accounts'] and row['accounts']['account_type'] == 'আয়')
        expense = sum(row['amount'] for row in response.data if row['accounts'] and row['accounts']['account_type'] == 'খরচ')
        
        summary = {
            'আয়': income,
            'খরচ': expense,
            'balance': income - expense,
            'period': f"{start_date} to {end_date}"
        }
        return summary
    except Exception as e:
        logger.error(f"Error generating report from Supabase: {e}")
        return {}

def backup_to_google_drive():
    """Exports all Supabase data to JSON and uploads it to Google Drive."""
    backup_file = f"foot_print_of_money_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    try:
        supabase = get_supabase_client()
        # Fetch all data
        accounts = supabase.table("accounts").select("*").execute().data
        methods = supabase.table("payment_methods").select("*").execute().data
        transactions = supabase.table("transactions").select("*").execute().data
        
        backup_data = {
            "metadata": {
                "version": "2.1 (Best Practices)",
                "export_date": datetime.now().isoformat(),
                "source": "Supabase via backend_utils"
            },
            "accounts": accounts,
            "payment_methods": methods,
            "transactions": transactions
        }
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
        sync = GoogleDriveSync(backup_file, logger)
        if sync.service:
            success = sync.upload_file()
            if success:
                logger.info(f"Backup uploaded successfully: {backup_file}")
                os.remove(backup_file)
                return True
        return False
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        if os.path.exists(backup_file):
            os.remove(backup_file)
        return False

if __name__ == '__main__':
    print("Testing Supabase SDK connection via backend_utils...")
    accs = get_accounts()
    print(f"Found {len(accs)} accounts.")
