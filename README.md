# QuarryMap PH

*Built from anywhere. Built to make impact visible.*

**QuarryMap PH** is a web-based platform that transforms static quarry permit records from the Mines and Geosciences Bureau into an interactive map-driven experience — combining real-time data exploration, geospatial visualization, and an AI-powered chatbot. Built to bridge the gap between raw government data and public understanding, it empowers users to explore, filter, and query quarry operations across the Philippines directly from their browser.

---

## 🌐 Live Demo

🔗 **Deployment**: https://hikarizz-quarrymapph-45jy-ameh66g5u.vercel.app/

---

## 📌 What It Does

- View quarry locations across the Philippines on a live interactive map
- Filter and explore permit records by region, province, municipality, and commodity
- Ask natural language questions through an AI-powered chatbot (English and Filipino)
- Assess environmental risk through computed risk indicators visualized on the map
- Download filtered data as CSV
- View data source transparency and disclaimers

---

## ✨ Core Features

- **Interactive Map Interface**  
  Web-based geospatial visualization of quarry operations

- **Real-Time Data Exploration**  
  Filter and sort records dynamically within the app

- **AI-Powered Assistant**  
  Ask questions directly in the web interface and receive insights

- **Dashboard Overview**  
  Instant summary of operational statuses

- **Map-Based Risk Visualization**  
  Risk scores are integrated directly into the map, allowing users to visually assess potential environmental impact across locations

- **Transparency Panel**  
  Disclosure of data sources and limitations

---

## 🧠  How It Works

The frontend is built with React and communicates with a FastAPI backend that serves quarry data from a SQLite database. The AI chatbot uses Google Gemini to answer questions about the dataset. The app is fully deployed on Vercel — the frontend is served as a static build and the backend runs as a Python serverless function via the `/api` route.

---

## 🚀 Hackathon Alignment

**Theme:** *Build from Anywhere, Build Anything*

**Domains Addressed:**

- **Intelligence Systems & Data**  
  Integrates AI to interpret complex datasets and enable natural language interaction

- **Green Tech & Sustainability**  
  Provides visibility into quarry operations to support environmental awareness and responsible decision-making

---

## 🏗️ Tech Stack

| Layer       | Technology |
|------------|------------|
| Frontend   | React, Vite, Material UI (MUI), MUI X DataGrid |
| Mapping    | Leaflet, React Leaflet |
| Backend    | FastAPI (Python) |
| Database   | SQLite |
| AI         | Google Gemini 2.5 Flash |
| Data       | Pandas |

---

## 🗂️ Data Source

**Mines and Geosciences Bureau (MGB)**
Directory of Operating Mines and Quarries

Records include permit holders, commodity types, operational statuses, permit timelines, and geographic coordinates across multiple regions in the Philippines.

🔗 https://www.mgb.gov.ph

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Google Gemini API Key

### 1. Clone the Repository

```bash
git clone https://github.com/shanehckr/hikarizz-quarrymapph.git
cd hikarizz-quarrymapph
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv

# Activate environment
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file inside the `backend/` folder:

Start the backend:

```bash
python main.py
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## 👥 Team

**Hikarizz** — 2026










