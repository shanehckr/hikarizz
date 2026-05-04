from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect('quarry_data.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/quarries")
def read_quarries():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cleaned_quarries")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]