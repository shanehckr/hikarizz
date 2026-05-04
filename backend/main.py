from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
import pandas as pd
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

@app.post("/api/analyze")
def analyze_data(question: str = Body(...)):
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM cleaned_quarries", conn)
    conn.close()

    # Example basic "AI-like" logic first
    if "most" in question.lower() and "municipality" in question.lower():
        result = (
            df.groupby("municipality")
            .size()
            .sort_values(ascending=False)
            .head(1)
        )
        return {
            "answer": f"{result.index[0]} has the most quarries ({result.iloc[0]})"
        }

    return {"answer": "Question not recognized yet."}

@app.get("/api/quarries")
def read_quarries():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cleaned_quarries")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY")

@app.post("/api/ai")
def ai_query(question: str = Body(...)):
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM cleaned_quarries", conn)
    conn.close()

    data_sample = df.head(50).to_json()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You analyze quarry environmental risk data."},
            {"role": "user", "content": f"Data: {data_sample}\n\nQuestion: {question}"}
        ]
    )

    return {"answer": response.choices[0].message.content}

@app.post("/api/analyze")
def analyze_data(question: str = Body(...)):
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM cleaned_quarries", conn)
    conn.close()

    q = question.lower()

    if "municip" in q:
        result = df.groupby("municipality").size().sort_values(ascending=False)
        return {"answer": f"{result.index[0]} has the most quarries with {int(result.iloc[0])} sites."}

    if "province" in q:
        result = df.groupby("province").size().sort_values(ascending=False)
        return {"answer": f"{result.index[0]} has the most quarries with {int(result.iloc[0])} sites."}

    if "expired" in q:
        expired = df[df["status"] == "Expired"]
        return {"answer": f"There are {len(expired)} expired permits."}

    df["risk"] = (df["area_hectares"].fillna(0) / 2).clip(upper=100)
    high = df[df["risk"] >= 70]

    if "risk" in q:
        return {"answer": f"There are {len(high)} high-risk sites."}

    return {"answer": "Try asking about municipalities, provinces, risk, or expired permits."}

@app.get("/api/dashboard")
def get_dashboard():
    import pandas as pd

    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM cleaned_quarries", conn)
    conn.close()

    df["area_hectares"] = pd.to_numeric(df["area_hectares"], errors="coerce").fillna(0)

    def calc_risk(row):
        score = 0
        if row["area_hectares"]:
            score += min(30, row["area_hectares"] / 2)
        if isinstance(row["material"], str) and "sand" in row["material"].lower():
            score += 20
        if isinstance(row["material"], str) and "gravel" in row["material"].lower():
            score += 15
        if row["status"] == "Expired":
            score += 30
        if row["status"] == "Pending":
            score += 10
        return min(100, round(score))

    df["riskScore"] = df.apply(calc_risk, axis=1)

    total = len(df)
    expired = len(df[df["status"] == "Expired"])
    producing = len(df[df["status"] == "Active"])
    high_risk = len(df[df["riskScore"] >= 70])

    top_risk = df.sort_values("riskScore", ascending=False).head(5)

    return {
        "total": int(total),
        "expired": int(expired),
        "producing": int(producing),
        "high_risk": int(high_risk),
        "top_risk": top_risk.to_dict(orient="records")
    }
