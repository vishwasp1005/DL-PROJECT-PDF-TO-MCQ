"""
Quick password reset script.
Run: venv\Scripts\python.exe reset_password.py
"""
import sqlite3
import sys

# Set venv path so we can import bcrypt
sys.path.insert(0, "venv/Lib/site-packages")
import bcrypt

USERNAME = "vishwas"    # Change this if needed
NEW_PASSWORD = "vishwas123"  # New password to set

hashed = bcrypt.hashpw(NEW_PASSWORD.encode(), bcrypt.gensalt()).decode()

conn = sqlite3.connect("quizgenius.db")
cur = conn.cursor()
cur.execute(
    "UPDATE users SET hashed_password = ? WHERE username = ?",
    (hashed, USERNAME)
)
if cur.rowcount == 0:
    print(f"[ERROR] User '{USERNAME}' not found in DB!")
else:
    conn.commit()
    print(f"[OK] Password for '{USERNAME}' reset to: {NEW_PASSWORD}")
conn.close()
