import sqlite3
import pandas as pd

# Load CSV
df = pd.read_csv("quarries.csv")

# Connect to DB (creates if not exists)
conn = sqlite3.connect("LandQuarry.db")

# Write to table
df.to_sql("quarries", conn, if_exists="replace", index=False)

conn.close()

print("✅ CSV imported into database!")