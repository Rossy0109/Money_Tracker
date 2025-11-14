import sqlite3
import hashlib
import os

db_path = os.getenv('MONEY_TRACKER_DB_PATH', 'advanced_money_tracker.db')
password = '010987'
password_hash = hashlib.sha256(password.encode()).hexdigest()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create the security table if it doesn't exist
cursor.execute('''
    CREATE TABLE IF NOT EXISTS security (
        id INTEGER PRIMARY KEY,
        password_hash TEXT,
        security_question TEXT,
        security_answer_hash TEXT
    )
''')

cursor.execute('INSERT OR REPLACE INTO security (id, password_hash) VALUES (1, ?)', (password_hash,))

conn.commit()
conn.close()

print("Password updated successfully.")
