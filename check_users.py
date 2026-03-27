import sqlite3
conn = sqlite3.connect("quizgenius.db")
users = conn.execute("SELECT id, username FROM users").fetchall()
print("Existing users in DB:")
for u in users:
    print(f"  id={u[0]}, username='{u[1]}'")
conn.close()
