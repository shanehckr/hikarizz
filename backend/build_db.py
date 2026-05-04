import pandas as pd
import sqlite3

# 1. Load the cleaned CSV data
df = pd.read_csv('cleaned_quarries.csv')

# 2. Create a true SQLite database connection
conn = sqlite3.connect('quarry_data.db')

# 3. Write the data into a table named 'cleaned_quarries'
df.to_sql('cleaned_quarries', conn, if_exists='replace', index=False)

conn.close()
print("Database generated successfully!")