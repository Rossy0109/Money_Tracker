import os
import sys
from dotenv import load_dotenv

# Add the server directory to sys.path to import backend_utils
sys.path.append(os.path.abspath("Foot_Print_of_Money/server"))

try:
    from backend_utils import get_supabase_client, logger
    
    print("Attempting to connect to Supabase...")
    supabase = get_supabase_client()
    
    # Try a simple query to verify connection (list tables or just a health check)
    # We'll try to fetch a single row from a known table or just check the client status
    response = supabase.table("transactions").select("*").limit(1).execute()
    
    print("✅ Connection Successful!")
    print(f"Sample Data (if any): {response.data}")

except Exception as e:
    print(f"❌ Connection Failed: {e}")
    sys.exit(1)
