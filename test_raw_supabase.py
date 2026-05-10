import os
import httpx
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

print(f"Testing connection to: {url}")
print(f"Using key starting with: {key[:15]}...")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

try:
    # Try to fetch from the rest/v1 endpoint (PostgREST)
    # We'll try to get the table list or just a health check
    response = httpx.get(f"{url}/rest/v1/", headers=headers)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print("✅ Success! The key is valid and can connect to PostgREST.")
        # print(response.json())
    else:
        print(f"❌ Failed: {response.text}")
except Exception as e:
    print(f"❌ Error: {e}")
