from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import math
import os
import traceback
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        print("WARNING: python-dotenv is not installed. Skipping .env loading.")

try:
    import google.generativeai as genai
except ImportError:
    genai = None

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if not api_key: print("WARNING: GEMINI_API_KEY not found in environment variables.")
if genai and api_key:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name='gemini-2.5-flash', system_instruction=("You are the Hikarizz AI Assistant for Hikarizz Project. Use the provided quarry data from the Philippines to answer questions. If the question is not about quarries, environmental risks, or the dataset, politely decline and steer the user back to land quarrying topics."))
else:
    if not genai: print("WARNING: google-generativeai is not installed. Using local dataset summaries for /api/analyze.")
    model = None
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "LandQuarry.db"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
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

def clean_records(df):
    safe_df = df.replace([float("inf"), float("-inf")], None).where(pd.notnull(df), None)
    return safe_df.to_dict(orient="records")

def pick_interactive_rows(df, question, limit=150):
    if df.empty:
        return df, "AI result set: 0 matching permits"

    q = question.lower()
    mask = pd.Series(False, index=df.index)
    text_mask = pd.Series(False, index=df.index)
    risk_mask = pd.Series(False, index=df.index)
    reasons = []

    text_columns = ["province", "municipality", "barangay", "region", "commodity", "contractor", "operator", "status", "remarks", "permit_type"]
    for col in text_columns:
        if col in df.columns:
            values = df[col].fillna("").astype(str)
            matches = [v for v in values.unique() if v and v.lower() in q]
            if matches:
                column_mask = values.isin(matches)
                mask = mask | column_mask
                text_mask = text_mask | column_mask
                reasons.extend(matches[:3])

    status_text = (df.get("status", "").fillna("").astype(str) + " " + df.get("remarks", "").fillna("").astype(str)).str.lower()
    if any(term in q for term in ["expired", "renewal", "expire"]):
        mask = mask | status_text.str.contains("expired|renewal", na=False)
        reasons.append("expired or renewal records")
    if "producing" in q or "active" in q:
        mask = mask | df.get("status", "").fillna("").astype(str).str.lower().str.contains("producing", na=False)
        reasons.append("producing records")
    if "suspended" in q or "suspension" in q:
        mask = mask | status_text.str.contains("suspended", na=False)
        reasons.append("suspended records")
    if any(term in q for term in ["high risk", "danger", "dangerous", "risky", "highest risk"]):
        risk_mask = df["riskScore"] >= 70
        mask = mask | risk_mask
        reasons.append("high-risk records")
    if any(term in q for term in ["sand", "gravel", "basalt", "limestone", "shale", "andesite", "silica", "gold", "copper"]):
        commodity = df.get("commodity", "").fillna("").astype(str).str.lower()
        for term in ["sand", "gravel", "basalt", "limestone", "shale", "andesite", "silica", "gold", "copper"]:
            if term in q:
                mask = mask | commodity.str.contains(term, na=False)
                reasons.append(term)

    if mask.any():
        if risk_mask.any() and text_mask.any() and (risk_mask & text_mask).any():
            scoped = df[risk_mask & text_mask].copy()
        else:
            scoped = df[mask].copy()
    elif any(term in q for term in ["top", "highest", "most", "risk", "danger"]):
        scoped = df.sort_values("riskScore", ascending=False).head(limit).copy()
        reasons.append("top risk records")
    else:
        scoped = df.head(limit).copy()
        reasons.append("dataset sample")

    scoped = scoped.sort_values("riskScore", ascending=False).head(limit)
    unique_reasons = []
    for reason in reasons:
        if reason and reason not in unique_reasons:
            unique_reasons.append(reason)

    label = f"AI result set: {len(scoped)} matching permits"
    if unique_reasons:
        label += " for " + ", ".join(unique_reasons[:4])
    return scoped, label

def local_dataset_answer(question, scoped_df, scope):
    if scoped_df.empty:
        return "I could not find matching quarry records for that question. Try asking about a province, commodity, permit status, or risk level."

    top = scoped_df.sort_values("riskScore", ascending=False).head(5)
    permits = len(scoped_df)
    provinces = scoped_df["province"].nunique() if "province" in scoped_df else 0
    commodities = scoped_df["commodity"].nunique() if "commodity" in scoped_df else 0
    high_risk = len(scoped_df[scoped_df["riskScore"] >= 70])

    examples = []
    for _, row in top.iterrows():
        contractor = row.get("contractor") or "Unknown contractor"
        municipality = row.get("municipality") or "Unknown municipality"
        province = row.get("province") or "Unknown province"
        commodity = row.get("commodity") or "Unknown commodity"
        risk = row.get("riskScore", 0)
        examples.append(f"- {contractor} in {municipality}, {province}: {commodity}, risk score {risk}")

    return (
        f"{scope}. The filtered records cover {permits} permits across {provinces} provinces and {commodities} commodities. "
        f"{high_risk} records are marked high risk.\n\nTop records by risk:\n" + "\n".join(examples)
    )

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

        df["riskScore"] = df.apply(lambda r: calc_risk(r), axis=1)
        interactive_df, scope = pick_interactive_rows(df, request.question)

        df_slim = df[['contractor', 'municipality', 'commodity', 'status', 'remarks', 'area_hectares', 'riskScore']]
        data_context = df_slim.fillna("").to_json(orient="records")
        interactive_context = interactive_df[['contractor', 'municipality', 'province', 'commodity', 'status', 'remarks', 'area_hectares', 'riskScore']].fillna("").to_json(orient="records")

        prompt = f"""
        You are an expert data analyst for the Hikarizz project.
        Below is the current quarrying database formatted as JSON:
        
        {data_context}

        These records were selected for the interactive map and table based on the user's question:
        {interactive_context}

        User's Question: {request.question}
        
        Rules for answering:
        1. Read EVERY record carefully before answering. Do not skim.
        2. If asked about "expired", "suspended", or "producing" permits, you MUST check BOTH the 'status' and 'remarks' fields.
        3. If asked about danger or risk, rely strictly on the 'riskScore' field.
        4. When giving examples, explicitly name the Contractor and the Municipality.
        5. Answer naturally, but base every fact strictly on the provided JSON data.
        """

        if not model:
            answer = local_dataset_answer(request.question, interactive_df, scope)
            return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

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

        return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

    except Exception as e:
        print("Analyze Error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
