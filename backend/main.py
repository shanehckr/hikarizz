from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import math
import google.generativeai as genai
from dotenv import load_dotenv
import os
import traceback


load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if not api_key: print("WARNING: GEMINI_API_KEY not found in environment variables.")
genai.configure(api_key=api_key)
model = genai.GenerativeModel(model_name='gemini-2.5-flash', system_instruction=("You are the Hikarizz AI Assistant for Hikarizz Project. Use the provided quarry data from the Philippines to answer questions. If the question is not about quarries, environmental risks, or the dataset, politely decline and steer the user back to land quarrying topics."))
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174/"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
def get_db_connection():
    conn = sqlite3.connect('LandQuarry.db')
    conn.row_factory = sqlite3.Row
    return conn
class ChatRequest(BaseModel): question: str
def calc_risk(row):
    score = 0
    try:
        area = pd.to_numeric(row.get("area_hectares"), errors="coerce")
        if not pd.isna(area) and area > 0: score += min(40, float(area) / 10)
    except: pass
    commodity = str(row.get("commodity", "")).lower()
    if any(x in commodity for x in ["sand", "gravel", "silt"]): score += 20
    if any(x in commodity for x in ["gold", "silver", "copper"]): score += 30
    status = str(row.get("status", "")).lower()
    remarks = str(row.get("remarks", "")).lower()
    if "renewal" in remarks or "expired" in status: score += 30
    if "suspended" in remarks: score += 25
    return min(100, round(score))
@app.get("/api/quarries")
def read_quarries():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM quarries")
        rows = cursor.fetchall()
        conn.close()
        result = []
        for i, row in enumerate(rows):
            r = dict(row)
            r["id"] = r.get("id") or i
            r["riskScore"] = calc_risk(r)
            r["is_expired_flag"] = (str(r.get("status")).lower() == "expired")
            for k, v in r.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): r[k] = None
            result.append(r)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/dashboard")
def get_dashboard():
    try:
        conn = get_db_connection()
        df = pd.read_sql_query("SELECT * FROM quarries", conn)
        conn.close()
        if df.empty: return {"total": 0, "expired": 0, "producing": 0, "high_risk": 0, "top_risk": []}
        def safe_calc(row):
            try: return calc_risk(row)
            except: return 0
        df["riskScore"] = df.apply(safe_calc, axis=1)
        df["status"] = df.get("status", "").astype(str)
        df["remarks"] = df.get("remarks", "").astype(str)
        status_col = df["status"].str.lower()
        remarks_col = df["remarks"].str.lower()
        top_risk_df = df.sort_values("riskScore", ascending=False).head(5)
        top_risk_df = top_risk_df.replace([float("inf"), float("-inf")], 0).fillna("")
        top_risk = top_risk_df.to_dict(orient="records")
        return {"total": int(len(df)), "expired": int(len(df[remarks_col.str.contains("renewal", na=False) | status_col.str.contains("expired", na=False)])), "producing": int(len(df[status_col == "producing"])), "high_risk": int(len(df[df["riskScore"] >= 70])), "top_risk": top_risk}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/analyze")
def analyze_data(request: ChatRequest):
    try:
        conn = get_db_connection()
        df = pd.read_sql_query("SELECT * FROM quarries", conn)
        conn.close()

        # Calculate risk scores
        df["riskScore"] = df.apply(lambda r: calc_risk(r), axis=1)

        # FIX 1: Convert the table to a JSON list, which AI reads perfectly
        # Strip out useless columns to save AI token limits
        df_slim = df[['contractor', 'municipality', 'commodity', 'status', 'remarks', 'area_hectares', 'riskScore']]
        data_context = df_slim.fillna("").to_json(orient="records")

        # FIX 2: The "Common Sense" Prompt
        prompt = f"""
        You are an expert data analyst for the Hikarizz project.
        Below is the current quarrying database formatted as JSON:
        
        {data_context}

        User's Question: {request.question}
        
        Rules for answering:
        1. Read EVERY record carefully before answering. Do not skim.
        2. If asked about "expired", "suspended", or "producing" permits, you MUST check BOTH the 'status' and 'remarks' fields.
        3. If asked about danger or risk, rely strictly on the 'riskScore' field.
        4. When giving examples, explicitly name the Contractor and the Municipality.
        5. Answer naturally, but base every fact strictly on the provided JSON data.
        """

        response = model.generate_content(prompt)

        # Safely extract text
        answer = None
        if response and response.candidates:
            for c in response.candidates:
                for p in c.content.parts:
                    if hasattr(p, "text"):
                        answer = p.text
                        break
        if not answer and hasattr(response, "text"):
            answer = response.text

        if not answer:
            raise Exception("No valid text in Gemini response")

        return {"answer": answer}

    except Exception as e:
        print("Analyze Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))