import pandas as pd
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "quarries.csv"
DB_PATH = BASE_DIR / "LandQuarry.db"

df = pd.read_csv(CSV_PATH)

with sqlite3.connect(DB_PATH) as conn:
    df.to_sql("quarries", conn, if_exists="replace", index=False)

    conn.execute("CREATE INDEX IF NOT EXISTS idx_quarries_province ON quarries (province)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quarries_commodity ON quarries (commodity)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quarries_contractor ON quarries (contractor)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quarries_status ON quarries (status)")

print(f"Database generated successfully at {DB_PATH}")
