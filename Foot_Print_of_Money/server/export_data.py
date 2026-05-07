import os
import json
from datetime import datetime
from backend_utils import get_supabase_client, logger

def run_standalone_backup():
    """Exports all Supabase data to a local JSON file."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = f"supabase_backup_{timestamp}.json"
    
    try:
        supabase = get_supabase_client()
        logger.info("Fetching data from Supabase...")
        
        # Fetch all tables
        accounts = supabase.table("accounts").select("*").execute().data
        methods = supabase.table("payment_methods").select("*").execute().data
        transactions = supabase.table("transactions").select("*").execute().data
        
        backup_data = {
            "metadata": {
                "version": "2.1",
                "export_date": datetime.now().isoformat(),
                "type": "Manual/Scheduled Artifact"
            },
            "accounts": accounts,
            "payment_methods": methods,
            "transactions": transactions
        }
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
        print(f"✅ Success! Data exported to: {backup_file}")
        return backup_file
    except Exception as e:
        print(f"❌ Backup failed: {e}")
        return None

if __name__ == '__main__':
    run_standalone_backup()
