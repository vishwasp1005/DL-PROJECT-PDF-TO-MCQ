import sqlite3

conn = sqlite3.connect("quizgenius.db")
c = conn.cursor()

columns_to_add = [
    ("score",           "ALTER TABLE quiz_sessions ADD COLUMN score INTEGER"),
    ("total_questions", "ALTER TABLE quiz_sessions ADD COLUMN total_questions INTEGER"),
    ("percentage",      "ALTER TABLE quiz_sessions ADD COLUMN percentage REAL"),
]

for col_name, sql in columns_to_add:
    try:
        c.execute(sql)
        print(f"[OK] Added column: {col_name}")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print(f"[SKIP] Column already exists: {col_name}")
        else:
            raise

conn.commit()
conn.close()
print("\n[DONE] Migration complete!")
