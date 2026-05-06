from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import math
import os
import traceback
from pathlib import Path

# ── dotenv ────────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ dotenv loaded")
except ImportError:
    print("⚠️  WARNING: python-dotenv not installed. Install with: pip install python-dotenv")

# ── Gemini import (catches ALL errors, not just ImportError) ──────────────────
genai = None
types = None
try:
    from google import genai as _genai
    from google.genai import types as _types
    genai = _genai
    types = _types
    print("✅ google-genai imported successfully")
except ImportError:
    print("❌ ERROR: google-genai is NOT installed.")
    print("   Fix: pip install google-genai")
except Exception as e:
    # Catches AttributeError, etc. from namespace package collisions
    print(f"❌ ERROR importing google-genai: {type(e).__name__}: {e}")
    print("   This can happen if 'google-generativeai' (old SDK) conflicts with 'google-genai' (new SDK).")
    print("   Fix: pip uninstall google-generativeai google-genai -y && pip install google-genai")

# ── API key ───────────────────────────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    print(f"✅ GEMINI_API_KEY found (starts with: {api_key[:8]}...)")
else:
    print("❌ ERROR: GEMINI_API_KEY not found in environment.")
    print("   Fix: Add GEMINI_API_KEY=your_key_here to your .env file")
    print(f"   Current working directory: {Path.cwd()}")
    print(f"   .env file exists: {Path('.env').exists()}")

# ── Gemini client ─────────────────────────────────────────────────────────────
client = None
if genai and api_key:
    try:
        client = genai.Client(api_key=api_key)
        print("✅ Gemini client initialized — AI mode ACTIVE")
    except Exception as e:
        print(f"❌ ERROR creating Gemini client: {e}")
        print("   Falling back to local dataset summaries.")
else:
    reasons = []
    if not genai:   reasons.append("google-genai not installed")
    if not api_key: reasons.append("GEMINI_API_KEY missing")
    print(f"⚠️  Gemini DISABLED ({'; '.join(reasons)}) — using local fallback")

# ── App setup ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = BASE_DIR / "LandQuarry.db"

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

class ChatRequest(BaseModel):
    question: str

# ── NEW: /api/status — paste this URL in your browser to diagnose ─────────────
@app.get("/api/status")
def get_status():
    """Diagnostic endpoint. Visit http://localhost:8000/api/status to see what's wrong."""
    return {
        "gemini_package_installed": genai is not None,
        "api_key_found": api_key is not None,
        "api_key_preview": (api_key[:8] + "...") if api_key else None,
        "client_ready": client is not None,
        "mode": "gemini" if client else "local_fallback",
        "db_exists": DB_PATH.exists(),
        "dotenv_file_exists": (BASE_DIR / ".env").exists(),
    }

# ── Helpers ───────────────────────────────────────────────────────────────────
def calc_risk(row):
    score = 0
    try:
        area = pd.to_numeric(row.get("area_hectares"), errors="coerce")
        if not pd.isna(area) and area > 0: score += min(40, float(area) / 10)
    except: pass
    commodity = str(row.get("commodity", "")).lower()
    if any(x in commodity for x in ["sand", "gravel", "silt"]): score += 20
    if any(x in commodity for x in ["gold", "silver", "copper"]): score += 30
    status  = str(row.get("status",  "")).lower()
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

    q        = question.lower()
    mask     = pd.Series(False, index=df.index)
    text_mask = pd.Series(False, index=df.index)
    risk_mask = pd.Series(False, index=df.index)
    reasons  = []

    text_columns = ["province", "municipality", "barangay", "region", "commodity",
                    "contractor", "operator", "status", "remarks", "permit_type"]
    for col in text_columns:
        if col in df.columns:
            values  = df[col].fillna("").astype(str)
            matches = [v for v in values.unique() if v and v.lower() in q]
            if matches:
                column_mask = values.isin(matches)
                mask       = mask | column_mask
                text_mask  = text_mask | column_mask
                reasons.extend(matches[:3])

    status_text = (
        df.get("status",  "").fillna("").astype(str) + " " +
        df.get("remarks", "").fillna("").astype(str)
    ).str.lower()

    if any(t in q for t in ["expired", "renewal", "expire"]):
        mask = mask | status_text.str.contains("expired|renewal", na=False)
        reasons.append("expired or renewal records")
    if "producing" in q or "active" in q:
        mask = mask | df.get("status", "").fillna("").astype(str).str.lower().str.contains("producing", na=False)
        reasons.append("producing records")
    if "suspended" in q or "suspension" in q:
        mask = mask | status_text.str.contains("suspended", na=False)
        reasons.append("suspended records")
    if any(t in q for t in ["high risk", "danger", "dangerous", "risky", "highest risk"]):
        risk_mask = df["riskScore"] >= 70
        mask = mask | risk_mask
        reasons.append("high-risk records")
    for term in ["sand", "gravel", "basalt", "limestone", "shale", "andesite", "silica", "gold", "copper"]:
        if term in q:
            commodity = df.get("commodity", "").fillna("").astype(str).str.lower()
            mask = mask | commodity.str.contains(term, na=False)
            reasons.append(term)

    if mask.any():
        if risk_mask.any() and text_mask.any() and (risk_mask & text_mask).any():
            scoped = df[risk_mask & text_mask].copy()
        else:
            scoped = df[mask].copy()
    elif any(t in q for t in ["top", "highest", "most", "risk", "danger"]):
        scoped = df.sort_values("riskScore", ascending=False).head(limit).copy()
        reasons.append("top risk records")
    else:
        scoped = df.head(limit).copy()
        reasons.append("dataset sample")

    scoped = scoped.sort_values("riskScore", ascending=False).head(limit)
    unique_reasons = list(dict.fromkeys(r for r in reasons if r))

    label = f"AI result set: {len(scoped)} matching permits"
    if unique_reasons:
        label += " for " + ", ".join(unique_reasons[:4])
    return scoped, label

def local_dataset_answer(question, scoped_df, scope):
    if scoped_df.empty:
        return "I could not find matching quarry records for that question. Try asking about a province, commodity, permit status, or risk level."

    top        = scoped_df.sort_values("riskScore", ascending=False).head(5)
    permits    = len(scoped_df)
    provinces  = scoped_df["province"].nunique()  if "province"  in scoped_df else 0
    commodities= scoped_df["commodity"].nunique() if "commodity" in scoped_df else 0
    high_risk  = len(scoped_df[scoped_df["riskScore"] >= 70])

    examples = []
    for _, row in top.iterrows():
        contractor  = row.get("contractor")  or "Unknown contractor"
        municipality= row.get("municipality")or "Unknown municipality"
        province    = row.get("province")    or "Unknown province"
        commodity   = row.get("commodity")   or "Unknown commodity"
        risk        = row.get("riskScore", 0)
        examples.append(f"- {contractor} in {municipality}, {province}: {commodity}, risk score {risk}")

    return (
        f"{scope}. The filtered records cover {permits} permits across "
        f"{provinces} provinces and {commodities} commodities. "
        f"{high_risk} records are marked high risk.\n\nTop records by risk:\n"
        + "\n".join(examples)
    )

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/quarries")
def read_quarries():
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM quarries")
        rows   = cursor.fetchall()
        conn.close()
        result = []
        for i, row in enumerate(rows):
            r = dict(row)
            r["id"]             = r.get("id") or i
            r["riskScore"]      = calc_risk(r)
            r["is_expired_flag"]= (str(r.get("status")).lower() == "expired")
            for k, v in r.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    r[k] = None
            result.append(r)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard")
def get_dashboard():
    try:
        conn = get_db_connection()
        df   = pd.read_sql_query("SELECT * FROM quarries", conn)
        conn.close()
        if df.empty:
            return {"total": 0, "expired": 0, "producing": 0, "high_risk": 0, "top_risk": []}

        df["riskScore"] = df.apply(lambda r: calc_risk(r), axis=1)
        df["status"]    = df.get("status",  "").astype(str)
        df["remarks"]   = df.get("remarks", "").astype(str)
        status_col  = df["status"].str.lower()
        remarks_col = df["remarks"].str.lower()

        top_risk_df = df.sort_values("riskScore", ascending=False).head(5)
        top_risk_df = top_risk_df.replace([float("inf"), float("-inf")], 0).fillna("")
        top_risk    = top_risk_df.to_dict(orient="records")

        return {
            "total":     int(len(df)),
            "expired":   int(len(df[remarks_col.str.contains("renewal", na=False) | status_col.str.contains("expired", na=False)])),
            "producing": int(len(df[status_col == "producing"])),
            "high_risk": int(len(df[df["riskScore"] >= 70])),
            "top_risk":  top_risk,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
def analyze_data(request: ChatRequest):
    try:
        conn = get_db_connection()
        df   = pd.read_sql_query("SELECT * FROM quarries", conn)
        conn.close()

        df["riskScore"]          = df.apply(lambda r: calc_risk(r), axis=1)
        interactive_df, scope    = pick_interactive_rows(df, request.question)

        # ── Fallback if Gemini is not configured ──────────────────────────────
        if not client:
            print("⚠️  /api/analyze: Gemini client not available — using local fallback")
            answer = local_dataset_answer(request.question, interactive_df, scope)
            return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

        # ── Build prompt ──────────────────────────────────────────────────────
        # Only send interactive_df to Gemini (not the full dataset) to stay within token limits
        cols = ['contractor', 'municipality', 'province', 'commodity',
                'status', 'remarks', 'area_hectares', 'riskScore']
        available_cols   = [c for c in cols if c in interactive_df.columns]
        interactive_json = interactive_df[available_cols].fillna("").to_json(orient="records")

        prompt = f"""You are an expert data analyst for the Hikarizz project — a civic transparency platform for Philippine quarrying permits.

The following permits were selected from the database based on the user's question:
{interactive_json}

User's Question: {request.question}

Rules:
1. Read EVERY record carefully. Do not skim.
2. For "expired" / "suspended" / "producing" queries, check BOTH 'status' AND 'remarks' fields.
3. For risk queries, use the 'riskScore' field (0–100).
4. Name the Contractor and Municipality in your examples.
5. Base every fact strictly on the provided data. Be concise and helpful."""

        print(f"📤 Sending {len(interactive_df)} records to Gemini for: {request.question!r}")

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are the Hikarizz AI Assistant. Answer questions about Philippine quarry permits "
                    "using only the provided data. If the question is unrelated to quarries, politely redirect."
                )
            ),
        )

        answer = response.text
        if not answer:
            raise ValueError("Gemini returned an empty response")

        print(f"✅ Gemini responded ({len(answer)} chars)")
        return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

    except Exception as e:
        print(f"❌ /api/analyze error: {type(e).__name__}: {e}")
        traceback.print_exc()
        # Graceful fallback — return local answer instead of crashing
        try:
            conn = get_db_connection()
            df = pd.read_sql_query("SELECT * FROM quarries", conn)
            conn.close()
            df["riskScore"] = df.apply(lambda r: calc_risk(r), axis=1)
            interactive_df, scope = pick_interactive_rows(df, request.question)
            answer = local_dataset_answer(request.question, interactive_df, scope)
            return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}
        except Exception:
            return {"answer": "Sorry, I'm having trouble answering that right now. Please try again in a moment.", "rows": [], "scope": ""}