from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import sqlite3
import math
import os
import logging
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("land_quarry_api")

def parse_cors_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

def resolve_database_path():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("sqlite:///"):
            raw_path = Path(database_url.removeprefix("sqlite:///"))
            return raw_path.resolve() if raw_path.is_absolute() else (PROJECT_DIR / raw_path).resolve()
        if database_url.startswith("sqlite://"):
            raw_path = Path(database_url.removeprefix("sqlite://"))
            return raw_path.resolve() if raw_path.is_absolute() else (PROJECT_DIR / raw_path).resolve()
        logger.warning("Only sqlite DATABASE_URL values are supported; falling back to LAND_QUARRY_DB_PATH")

    return Path(os.getenv("LAND_QUARRY_DB_PATH") or BASE_DIR / "LandQuarry.db").resolve()

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
    load_dotenv(PROJECT_DIR / ".env")
    load_dotenv(BASE_DIR / ".env", override=True)
    logger.info("dotenv loaded")
except ImportError:
    logger.warning("python-dotenv not installed. Install with: pip install python-dotenv")

DB_PATH = resolve_database_path()
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-2.0-flash"

# ── Gemini import (catches ALL errors, not just ImportError) ──────────────────
genai = None
types = None
try:
    from google import genai as _genai
    from google.genai import types as _types
    genai = _genai
    types = _types
    logger.info("google-genai imported successfully")
except ImportError:
    logger.error("google-genai is not installed. Fix: pip install google-genai")
except Exception as e:
    # Catches AttributeError, etc. from namespace package collisions
    logger.exception("importing google-genai failed: %s: %s", type(e).__name__, e)
    logger.error("This can happen if google-generativeai conflicts with google-genai. Fix: pip uninstall google-generativeai google-genai -y && pip install google-genai")

# ── API key ───────────────────────────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    logger.info("GEMINI_API_KEY found (starts with: %s...)", api_key[:8])
else:
    logger.error("GEMINI_API_KEY not found in environment.")
    logger.error("Fix: Add GEMINI_API_KEY=your_key_here to your .env file")
    logger.error("Current working directory: %s", Path.cwd())
    logger.error(".env file exists: %s", Path(".env").exists())

# ── Gemini client ─────────────────────────────────────────────────────────────
client = None
if genai and api_key:
    try:
        client = genai.Client(api_key=api_key)
        logger.info("Gemini client initialized - AI mode active")
    except Exception as e:
        logger.exception("creating Gemini client failed: %s", e)
        logger.info("Falling back to local dataset summaries.")
else:
    reasons = []
    if not genai:   reasons.append("google-genai not installed")
    if not api_key: reasons.append("GEMINI_API_KEY missing")
    logger.warning("Gemini disabled (%s) - using local fallback", "; ".join(reasons))

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)

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
        "gemini_model": GEMINI_MODEL,
        "env_mode": os.getenv("ENV_MODE", "development"),
        "port": os.getenv("PORT", "8000"),
        "db_exists": DB_PATH.exists(),
        "cors_origins_configured": len(parse_cors_origins()),
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

def load_quarries_dataframe():
    if not DB_PATH.exists():
        logger.error("Database not found: %s", DB_PATH)
        return pd.DataFrame()

    with get_db_connection() as conn:
        df = pd.read_sql_query("SELECT * FROM quarries", conn)

    if df.empty:
        return df

    df["riskScore"] = df.apply(lambda r: calc_risk(r), axis=1)
    if "id" not in df.columns:
        df["id"] = df.index
    else:
        fallback_ids = pd.Series(df.index, index=df.index)
        df["id"] = df["id"].where(pd.notnull(df["id"]), fallback_ids)
    status_col = df["status"] if "status" in df.columns else pd.Series("", index=df.index)
    df["is_expired_flag"] = status_col.astype(str).str.lower() == "expired"
    return df

def build_dashboard(df):
    if df.empty:
        return {"total": 0, "expired": 0, "producing": 0, "high_risk": 0, "top_risk": []}

    status = df["status"] if "status" in df.columns else pd.Series("", index=df.index)
    remarks = df["remarks"] if "remarks" in df.columns else pd.Series("", index=df.index)
    status_col = status.astype(str).str.lower()
    remarks_col = remarks.astype(str).str.lower()
    top_risk_df = df.sort_values("riskScore", ascending=False).head(5)

    return {
        "total": int(len(df)),
        "expired": int(len(df[remarks_col.str.contains("renewal", na=False) | status_col.str.contains("expired", na=False)])),
        "producing": int(len(df[status_col == "producing"])),
        "high_risk": int(len(df[df["riskScore"] >= 70])),
        "top_risk": clean_records(top_risk_df),
    }

QUARRIES_DF = load_quarries_dataframe()
QUARRIES_RECORDS = clean_records(QUARRIES_DF) if not QUARRIES_DF.empty else []
DASHBOARD_CACHE = build_dashboard(QUARRIES_DF)
logger.info("Loaded %s quarry records from %s", len(QUARRIES_DF), DB_PATH)

def get_quarries_dataframe():
    return QUARRIES_DF.copy()

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
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Database is not available")
    return QUARRIES_RECORDS

@app.get("/api/dashboard")
def get_dashboard():
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Database is not available")
    return DASHBOARD_CACHE

@app.post("/api/analyze")
def analyze_data(request: ChatRequest):
    try:
        question_type = classify_question(request.question)
        if question_type == "greeting":
            return {"answer": GREETING_REPLY, "rows": [], "scope": "Greeting"}
        if question_type == "out_of_scope":
            return {"answer": DATA_SCOPE_MESSAGE, "rows": [], "scope": "Outside quarry data scope"}

        df = get_quarries_dataframe()
        interactive_df, scope    = pick_interactive_rows(df, request.question)

        # ── Fallback if Gemini is not configured ──────────────────────────────
        if not client:
            logger.warning("/api/analyze: Gemini client not available - using local fallback")
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

        logger.info("Sending %s records to Gemini for: %r", len(interactive_df), request.question)

        response = client.models.generate_content(
            model=GEMINI_MODEL,
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

        logger.info("Gemini responded (%s chars)", len(answer))
        return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}

    except Exception as e:
        logger.exception("/api/analyze error: %s: %s", type(e).__name__, e)
        # Graceful fallback — return local answer instead of crashing
        try:
            df = get_quarries_dataframe()
            interactive_df, scope = pick_interactive_rows(df, request.question)
            answer = local_dataset_answer(request.question, interactive_df, scope)
            return {"answer": answer, "rows": clean_records(interactive_df), "scope": scope}
        except Exception:
            return {"answer": "Sorry, I'm having trouble answering that right now. Please try again in a moment.", "rows": [], "scope": ""}
