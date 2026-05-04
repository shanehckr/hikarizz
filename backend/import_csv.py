import sqlite3
import pandas as pd

# Load CSV
df = pd.read_csv("cleaned_quarries.csv")

# Connect to DB (creates if not exists)
conn = sqlite3.connect("quarry_data.db")

# Write to table
df.to_sql("cleaned_quarries", conn, if_exists="replace", index=False)

conn.close()

print("✅ CSV imported into database!")