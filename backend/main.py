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
    "I\'m the **Quarry Land Assistant** — I only help with Philippine land quarry permit data.",
    "",
    "You can ask me about:",
    "* Permit holders or contractors",
    "* Provinces, municipalities, and quarry locations",
    "* Commodities such as sand, gravel, limestone, or gold",
    "* Operating status — producing, suspended, no operation",
    "* Risk scores and how they are calculated",
    "* Expiration dates and permit history",
    "",
    "Try: \"What are the high-risk quarries in Batangas?\" or \"Show suspended permits in Cebu.\"",
])

GREETING_REPLY = "\n".join([
    "Hi! I\'m the **Quarry Land Assistant** 👋",
    "",
    "I can help you explore Philippine quarry permit data. Try asking:",
    "* \"What are the high-risk quarries in Batangas?\"",
    "* \"Show me suspended operations in Cebu.\"",
    "* \"Which province has the most expired permits?\"",
    "* \"Paano kinukwenta ang risk score?\"",
    "",
    "What would you like to know?",
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

def clean_json_value(value):
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    return value

def clean_records(df):
    records = df.replace([float("inf"), float("-inf")], None).to_dict(orient="records")
    return [
        {key: clean_json_value(value) for key, value in record.items()}
        for record in records
    ]

def pick_interactive_rows(df, question, limit=15):
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
                "**How the Risk Score Works**\n\n"
                "The risk score (0–100) is generated by this app — not an official government rating. "
                "It screens permits using three factors from the database:\n\n"
                "* **Area** — adds up to 40 points (1 pt per 10 ha). Larger quarries = higher footprint.\n"
                "* **Commodity** — sand, gravel, or silt add 20 pts; "
                "gold, silver, or copper add 30 pts (metallic extraction risk).\n"
                "* **Status / Remarks** — expired or renewal permits add 30 pts; suspended operations add 25 pts.\n\n"
                "**In short:** mas mataas ang score kapag mas malaki ang area, mas sensitive ang commodity, "
                "o may permit/status concern.\n\n"
                "Use it as a quick screening signal, then check the full permit details in the table."
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
        examples.append(f"* **{contractor}** — {municipality}, {province} | {commodity} | Risk: {risk}")

    high_label = f"**{high_risk}** record{'s are' if high_risk != 1 else ' is'} high risk (score ≥ 70)" if high_risk else "No high-risk records in this set"
    summary = (
        f"Found **{permits}** permit{'s' if permits != 1 else ''} across "
        f"**{provinces}** province{'s' if provinces != 1 else ''} and "
        f"**{commodities}** commodit{'ies' if commodities != 1 else 'y'}. {high_label}.\n\n"
        f"**Top records by risk score:**\n"
    )
    return summary + "\n".join(examples)

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

        prompt = f"""You are a data analyst for the Hikarizz civic transparency platform for Philippine quarrying permits.

PERMIT DATA (JSON — these are the records relevant to the question):
{interactive_json}

USER QUESTION: {request.question}

RESPONSE FORMAT:
- Start with a direct 1–2 sentence answer.
- Use **bold** for contractor names, province names, and key numbers.
- Use bullet points (* ) when listing records or facts. Show at most 6 records.
- Format each record as: * **[Contractor]** — [Municipality], [Province] | [Commodity] | Risk: [score]
- Keep the total response under 280 words.
- End with one brief follow-up tip if it adds value (e.g. "You can filter by province in the sidebar.").
- You may naturally mix English and simple Tagalog (e.g. "Ito ang mga high-risk quarries").

RULES:
1. Read every record carefully. Do not skim.
2. Check BOTH 'status' AND 'remarks' fields for expired / suspended / producing queries.
3. Use the 'riskScore' field (0–100) for all risk queries.
4. Never invent data not present in the provided JSON.
5. If fewer than 3 records match, say so clearly and suggest a broader query."""

        log(f"[INFO] Sending {len(interactive_df)} records to Gemini for: {request.question!r}")

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are the Quarry Land Assistant for Hikarizz — a civic transparency tool for Philippine quarry permits. "
                    "Answer each question independently using only the provided permit data. "
                    "Format responses clearly: use **bold** for key names and numbers, bullet points (* ) for lists. "
                    "Be concise, friendly, and helpful. "
                    "If the question is unrelated to quarries or the dataset, politely redirect the user."
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
