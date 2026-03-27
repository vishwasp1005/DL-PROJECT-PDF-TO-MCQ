import sqlite3
conn = sqlite3.connect("quizgenius.db")
cols = [row[1] for row in conn.execute("PRAGMA table_info(quiz_sessions)")]
print("quiz_sessions columns:", cols)
conn.close()
