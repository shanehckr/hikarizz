from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import math
import os
import traceback
from pathlib import Path

DATA_SCOPE_MESSAGE = "\n".join([
    "I'm the Quarry Land Assistant - I can only help with questions about Philippine land quarry permits and data.",
    "",
    "You can ask me about:",
    "* Permit holders or contractors",
    "* Provinces, municipalities, and locations",
    "* Commodities such as sand, gravel, limestone, or basalt",
    "* Operating status - producing, suspended, no operation",
    "* Risk scores and how they are calculated",
    "* Expiration dates and permit details",
    "",
    'Try asking: "What are the high risk quarries in Batangas?" or "Paano kinukwenta ang risk score?"',
])

GREETING_REPLY = "\n".join([
    "Hi! I'm the Quarry Land Assistant.",
    "",
    "I can help you explore Philippine quarry permit data. Ask me about:",
    "* Specific quarries, contractors, or locations",
    "* Risk scores and what makes a quarry high risk",
    "* Permit status - producing, suspended, or expired",
    "* Commodities like sand, gravel, or limestone",
])

def log(message):
    print(str(message).encode("ascii", errors="replace").decode("ascii"))

def classify_question(question):
    q = question.strip().lower()
    if not q:
        return "out_of_scope"
    greeting_terms = ("hello", "hi", "hey", "kumusta", "kamusta", "magandang", "good morning", "good afternoon", "good evening", "musta")
    if len(q.split()) <= 5 and q.startswith(greeting_terms):
        return "greeting"

    out_topics = (
        "weather", "sports", "politics", "cooking", "recipe", "movie", "music", "celebrity",
        "stock", "crypto", "bitcoin", "fashion", "travel", "hotel", "flight", "basketball",
        "football", "nba", "nfl"
    )
    quarry_terms = (
        "permit", "record", "contractor", "operator", "holder", "province", "municipality",
        "barangay", "location", "region", "commodity", "status", "expired", "expire",
        "expiration", "approved", "date", "risk", "score", "producing", "suspended",
        "operation", "area", "hectare", "quarry", "quarrying", "mine", "mineral", "sand",
        "gravel", "limestone", "basalt", "shale", "andesite", "silica", "gold", "copper",
        "environmental", "hazard", "mgb"
    )
    if any(topic in q for topic in out_topics) and not any(term in q for term in quarry_terms):
        return "out_of_scope"
    if any(term in q for term in quarry_terms):
        return "quarry_related"
    return "out_of_scope"

# ── dotenv ────────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    log("[OK] dotenv loaded")
except ImportError:
    log("[WARN] python-dotenv not installed. Install with: pip install python-dotenv")

# ── Gemini import (catches ALL errors, not just ImportError) ──────────────────
genai = None
types = None
try:
    from google import genai as _genai
    from google.genai import types as _types
    genai = _genai
    types = _types
    log("[OK] google-genai imported successfully")
except ImportError:
    log("[ERROR] google-genai is NOT installed.")
    log("   Fix: pip install google-genai")
except Exception as e:
    # Catches AttributeError, etc. from namespace package collisions
    log(f"[ERROR] importing google-genai: {type(e).__name__}: {e}")
    log("   This can happen if 'google-generativeai' (old SDK) conflicts with 'google-genai' (new SDK).")
    log("   Fix: pip uninstall google-generativeai google-genai -y && pip install google-genai")

# ── API key ───────────────────────────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    log(f"[OK] GEMINI_API_KEY found (starts with: {api_key[:8]}...)")
else:
    log("[ERROR] GEMINI_API_KEY not found in environment.")
    log("   Fix: Add GEMINI_API_KEY=your_key_here to your .env file")
    log(f"   Current working directory: {Path.cwd()}")
    log(f"   .env file exists: {Path('.env').exists()}")

# ── Gemini client ─────────────────────────────────────────────────────────────
client = None
if genai and api_key:
    try:
        client = genai.Client(api_key=api_key)
        log("[OK] Gemini client initialized - AI mode ACTIVE")
    except Exception as e:
        log(f"[ERROR] creating Gemini client: {e}")
        log("   Falling back to local dataset summaries.")
else:
    reasons = []
    if not genai:   reasons.append("google-genai not installed")
    if not api_key: reasons.append("GEMINI_API_KEY missing")
    log(f"[WARN] Gemini DISABLED ({'; '.join(reasons)}) - using local fallback")

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
    q = question.lower()
    if any(term in q for term in ["paano", "how", "calculate", "computed", "formula", "kinukwenta", "risk score"]):
        if "risk" in q or "score" in q:
            return (
                "The quarry risk score is an app-generated guide from the permit data, not an official government rating. "
                "It looks at factors available in the database: permit area, commodity type, and status or remarks.\n\n"
                "* Larger quarry areas can add risk points.\n"
                "* Sand, gravel, and silt add risk because they commonly affect rivers and land movement.\n"
                "* Metallic commodities such as gold, silver, or copper add more risk points.\n"
                "* Expired, renewal, or suspended records can add risk points.\n\n"
                "In short: mas mataas ang score kapag mas malaki ang area, mas sensitive ang commodity, or may permit/status concern. "
                "Use it as a screening signal, then check the permit details in the table."
            )

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
        question_type = classify_question(request.question)
        if question_type == "greeting":
            return {"answer": GREETING_REPLY, "rows": [], "scope": "Greeting"}
        if question_type == "out_of_scope":
            return {"answer": DATA_SCOPE_MESSAGE, "rows": [], "scope": "Outside quarry data scope"}

        conn = get_db_connection()
        df   = pd.read_sql_query("SELECT * FROM quarries", conn)
        conn.close()

        df["riskScore"]          = df.apply(lambda r: calc_risk(r), axis=1)
        interactive_df, scope    = pick_interactive_rows(df, request.question)

        # ── Fallback if Gemini is not configured ──────────────────────────────
        if not client:
            log("[WARN] /api/analyze: Gemini client not available - using local fallback")
            answer = local_dataset_answer(request.question, interactive_df, scope)
            return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

        # ── Build prompt ──────────────────────────────────────────────────────
        # Only send interactive_df to Gemini (not the full dataset) to stay within token limits
        cols = ['contractor', 'municipality', 'province', 'commodity',
                'status', 'remarks', 'area_hectares', 'riskScore']
        available_cols   = [c for c in cols if c in interactive_df.columns]
        interactive_json = interactive_df[available_cols].fillna("").to_json(orient="records")

        prompt = f"""You are an expert data analyst for the Hikarizz project - a civic transparency platform for Philippine quarrying permits.

The following permits were selected from the database based on the user's question:
{interactive_json}

User's Question: {request.question}

Rules:
1. Read EVERY record carefully. Do not skim.
2. For "expired" / "suspended" / "producing" queries, check BOTH 'status' AND 'remarks' fields.
3. For risk queries, use the 'riskScore' field (0-100).
4. Name the Contractor and Municipality in your examples.
5. Base every fact strictly on the provided data.
6. You may explain concepts such as quarry risk, permits, and status, but keep the explanation tied to the provided Philippine quarry permit data.
7. Reply in friendly, citizen-facing English. You may include simple Tagalog phrasing when helpful."""

        log(f"[INFO] Sending {len(interactive_df)} records to Gemini for: {request.question!r}")

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are the Quarry Land Assistant for Hikarizz. Answer independently each time; do not assume chat memory. "
                    "Only help with Philippine land quarry permits, quarry locations, commodities, permit holders, "
                    "operating status, expiration dates, and risk scores from the provided app data. "
                    "You may answer explanatory questions only when they stay aligned with quarry permits or the dataset. "
                    "If a question is unrelated, use the assistant's data-scope message and redirect politely."
                )
            ),
        )

        answer = response.text
        if not answer:
            raise ValueError("Gemini returned an empty response")

        log(f"[OK] Gemini responded ({len(answer)} chars)")
        return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

    except Exception as e:
        log(f"[ERROR] /api/analyze error: {type(e).__name__}: {e}")
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
