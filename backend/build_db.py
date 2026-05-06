import pandas as pd
import sqlite3

# 1. Load the cleaned CSV data
df = pd.read_csv('quarries.csv')

# 2. Create a true SQLite database connection
conn = sqlite3.connect('LandQuarry.db')


df.to_sql('quarries', conn, if_exists='replace', index=False)

conn.close()
print("Database generated successfully!")