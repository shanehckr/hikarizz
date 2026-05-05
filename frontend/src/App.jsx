import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { DataGrid } from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import 'leaflet/dist/leaflet.css';

const phCenter = [12.8797, 121.7740];
const phBounds = [
  [4.4, 116.0],
  [21.3, 127.2],
];
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const getRiskColor = (score) => {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f59e0b';
  return '#22c55e';
};

const mapTiles = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

const selectMenuProps = {
  anchorOrigin: { vertical: 'top', horizontal: 'left' },
  transformOrigin: { vertical: 'bottom', horizontal: 'left' },
  PaperProps: {
    sx: {
      maxHeight: 280,
      mt: -1,
    },
  },
};

function MapResizeWatcher({ watch }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [map, watch]);

  return null;
}

function MapFitToRows({ rows }) {
  const map = useMap();

  useEffect(() => {
    const points = rows
      .map((row) => [Number(row.latitude), Number(row.longitude)])
      .filter(
        ([lat, lng]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= phBounds[0][0] &&
          lat <= phBounds[1][0] &&
          lng >= phBounds[0][1] &&
          lng <= phBounds[1][1],
      );

    if (!points.length) {
      map.fitBounds(phBounds, { padding: [18, 18], animate: true });
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 11, { animate: true });
      return;
    }

    map.fitBounds(points, { padding: [36, 36], maxZoom: 11, animate: true });
  }, [map, rows]);

  return null;
}

const knownProvinceNames = [
  'abra', 'agusan del norte', 'agusan del sur', 'aklan', 'albay', 'antique', 'apayao', 'aurora',
  'basilan', 'bataan', 'batanes', 'batangas', 'benguet', 'biliran', 'bohol', 'bukidnon', 'bulacan',
  'cagayan', 'camarines norte', 'camarines sur', 'camiguin', 'capiz', 'catanduanes', 'cavite', 'cebu',
  'cotabato', 'davao de oro', 'davao del norte', 'davao del sur', 'davao occidental', 'davao oriental',
  'dinagat islands', 'eastern samar', 'guimaras', 'ifugao', 'ilocos norte', 'ilocos sur', 'iloilo',
  'isabela', 'kalinga', 'la union', 'laguna', 'lanao del norte', 'lanao del sur', 'leyte',
  'maguindanao', 'marinduque', 'masbate', 'misamis occidental', 'misamis oriental', 'mountain province',
  'negros occidental', 'negros oriental', 'northern samar', 'nueva ecija', 'nueva vizcaya',
  'occidental mindoro', 'oriental mindoro', 'palawan', 'pampanga', 'pangasinan', 'quezon', 'quirino',
  'rizal', 'romblon', 'samar', 'sarangani', 'siquijor', 'sorsogon', 'south cotabato', 'southern leyte',
  'sultan kudarat', 'sulu', 'surigao del norte', 'surigao del sur', 'tarlac', 'tawi-tawi', 'zambales',
  'zamboanga del norte', 'zamboanga del sur', 'zamboanga sibugay',
];

const textIncludesPhrase = (text, phrase) => new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text);

const outOfScopePlaces = [
  'america', 'usa', 'united states', 'canada', 'china', 'japan', 'korea', 'australia', 'europe',
  'africa', 'india', 'indonesia', 'malaysia', 'thailand', 'vietnam', 'singapore',
];

function getProvinceIntent(rows, question) {
  const q = question.toLowerCase();
  const datasetProvinces = [...new Set(rows.map((row) => row.province).filter(Boolean))];
  const matchedDatasetProvince = datasetProvinces.find((province) => textIncludesPhrase(q, province.toLowerCase()));
  if (matchedDatasetProvince) return { type: 'matched', province: matchedDatasetProvince };

  const mentionedKnownProvince = knownProvinceNames.find((province) => textIncludesPhrase(q, province));
  if (mentionedKnownProvince) return { type: 'missing', province: mentionedKnownProvince.replace(/\b\w/g, (letter) => letter.toUpperCase()) };

  const mentionedOutOfScopePlace = outOfScopePlaces.find((place) => textIncludesPhrase(q, place));
  if (mentionedOutOfScopePlace) return { type: 'outside', province: mentionedOutOfScopePlace.replace(/\b\w/g, (letter) => letter.toUpperCase()) };

  return { type: 'none', province: '' };
}

function buildInteractiveRows(rows, question) {
  const q = question.toLowerCase();
  const provinceIntent = getProvinceIntent(rows, question);
  const baseRows = provinceIntent.type === 'matched' ? rows.filter((row) => row.province === provinceIntent.province) : rows;

  if (provinceIntent.type === 'missing') {
    return {
      rows: [],
      scope: `AI preview: 0 matching permits for ${provinceIntent.province}`,
      requestedProvince: provinceIntent.province,
    };
  }

  if (provinceIntent.type === 'outside') {
    return {
      rows: [],
      scope: `AI preview: 0 matching permits for ${provinceIntent.province}`,
      requestedPlace: provinceIntent.province,
    };
  }

  let textMatches = [];
  let riskMatches = [];
  const reasons = provinceIntent.type === 'matched' ? [provinceIntent.province] : [];
  const textFields = provinceIntent.type === 'matched'
    ? ['municipality', 'barangay', 'region', 'commodity', 'contractor', 'operator', 'status', 'remarks', 'permit_type']
    : ['province', 'municipality', 'barangay', 'region', 'commodity', 'contractor', 'operator', 'status', 'remarks', 'permit_type'];

  baseRows.forEach((row) => {
    textFields.forEach((field) => {
      const value = String(row[field] || '').trim();
      if (value && textIncludesPhrase(q, value.toLowerCase())) {
        textMatches.push(row);
        if (reasons.length < 4 && !reasons.includes(value)) reasons.push(value);
      }
    });
  });

  const statusTerms = `${q} `;
  if (/expired|renewal|expire/.test(statusTerms)) {
    textMatches = textMatches.concat(baseRows.filter((row) => `${row.status || ''} ${row.remarks || ''}`.toLowerCase().match(/expired|renewal/)));
    reasons.push('expired or renewal records');
  }
  if (/producing|active/.test(statusTerms)) {
    textMatches = textMatches.concat(baseRows.filter((row) => String(row.status || '').toLowerCase().includes('producing')));
    reasons.push('producing records');
  }
  if (/suspended|suspension/.test(statusTerms)) {
    textMatches = textMatches.concat(baseRows.filter((row) => `${row.status || ''} ${row.remarks || ''}`.toLowerCase().includes('suspended')));
    reasons.push('suspended records');
  }
  if (/high risk|danger|dangerous|risky|highest risk/.test(statusTerms)) {
    riskMatches = baseRows.filter((row) => Number(row.riskScore || 0) >= 70);
    reasons.push('high-risk records');
  }

  ['sand', 'gravel', 'basalt', 'limestone', 'shale', 'andesite', 'silica', 'gold', 'copper'].forEach((term) => {
    if (textIncludesPhrase(q, term)) {
      textMatches = textMatches.concat(baseRows.filter((row) => String(row.commodity || '').toLowerCase().includes(term)));
      reasons.push(term);
    }
  });

  const uniqueById = (items) => [...new Map(items.map((item, index) => [item.id ?? index, item])).values()];
  const textSet = uniqueById(textMatches);
  const riskSet = uniqueById(riskMatches);
  let scoped = [];

  if (textSet.length && riskSet.length) {
    const textIds = new Set(textSet.map((row) => row.id));
    scoped = riskSet.filter((row) => textIds.has(row.id));
  } else {
    scoped = uniqueById(textSet.concat(riskSet));
  }

  if (!scoped.length && /top|highest|most|risk|danger/.test(q)) {
    scoped = [...baseRows].sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)).slice(0, 150);
    reasons.push('top risk records');
  }

  if (!scoped.length && provinceIntent.type === 'matched') scoped = baseRows.slice(0, 150);
  if (!scoped.length && provinceIntent.type === 'none') scoped = rows.slice(0, 150);

  scoped = [...scoped].sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)).slice(0, 150);
  const cleanReasons = [...new Set(reasons.filter(Boolean))].slice(0, 4);
  const scope = `AI preview: ${scoped.length} matching permits${cleanReasons.length ? ` for ${cleanReasons.join(', ')}` : ''}`;
  return { rows: scoped, scope };
}

function buildLocalAnswer(preview, question) {
  const rows = preview.rows || [];
  const q = question.toLowerCase();

  if (!rows.length) {
    if (preview.requestedProvince) {
      return `I could not find quarry records for ${preview.requestedProvince} in the local dataset. The current dataset only has records for Bataan, Batangas, La Union, Rizal, Tarlac, and Zambales.`;
    }
    if (preview.requestedPlace) {
      return `I could not find quarry records for ${preview.requestedPlace}. This project currently contains Philippine quarry records only, with data for Bataan, Batangas, La Union, Rizal, Tarlac, and Zambales.`;
    }
    return 'I could not find matching quarry records in the local dataset for that question.';
  }

  const uniqueValues = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
  const municipalities = uniqueValues('municipality');
  const provinces = uniqueValues('province');
  const commodities = uniqueValues('commodity');
  const highRisk = rows.filter((row) => Number(row.riskScore || 0) >= 70).length;

  if (q.includes('municipalit')) {
    return `${preview.scope}.\n\nMunicipalities:\n${municipalities.map((value) => `* ${value}`).join('\n')}`;
  }

  if (q.includes('location')) {
    return `${preview.scope}.\n\nLocations found:\n${rows
      .slice(0, 20)
      .map((row) => `* ${row.municipality || 'Unknown municipality'}, ${row.province || 'Unknown province'} - ${row.contractor || 'Unknown contractor'}`)
      .join('\n')}`;
  }

  return `${preview.scope}. The matching records cover ${rows.length} permits across ${provinces.length} province${provinces.length === 1 ? '' : 's'} and ${commodities.length} commodit${commodities.length === 1 ? 'y' : 'ies'}. ${highRisk} record${highRisk === 1 ? ' is' : 's are'} high risk.\n\nTop records:\n${rows
    .slice(0, 6)
    .map((row) => `* ${row.contractor || 'Unknown contractor'} - ${row.municipality || 'Unknown municipality'}, ${row.province || 'Unknown province'} (${row.commodity || 'Unknown commodity'}, risk ${row.riskScore ?? 0})`)
    .join('\n')}`;
}

const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href =
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Google+Sans+Display:wght@400;700&display=swap';
document.head.appendChild(fontLink);

const styleTag = document.createElement('style');
styleTag.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100vh; width: 100vw; margin: 0; overflow: hidden; font-family: 'Google Sans', system-ui, sans-serif; }
  body { background: #0e1018; }
  button, input, textarea { font: inherit; }

  .lqe-root {
    --bg: #0e1018;
    --panel: #13161f;
    --panel-2: #1a1d26;
    --line: #2a2d3a;
    --text: #e8e2d4;
    --muted: #8d91a3;
    --accent: #d4a855;
    --accent-text: #0e1018;
    --table-bg: #0e1018;
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    color: var(--text);
    background: var(--bg);
  }

  .lqe-root.light {
    --bg: #f6f7f2;
    --panel: #ffffff;
    --panel-2: #eef1ea;
    --line: #d8ded3;
    --text: #182018;
    --muted: #66705f;
    --accent: #2f7d58;
    --accent-text: #ffffff;
    --table-bg: #fbfcf8;
  }

  .lqe-header {
    height: 60px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 20px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .lqe-logo { font-family: 'Google Sans Display', sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--text); white-space: nowrap; }
  .lqe-badge { font-size: 0.62rem; background: var(--accent); color: var(--accent-text); padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
  .lqe-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }

  .lqe-stats { flex-shrink: 0; display: grid; grid-template-columns: repeat(4, 1fr); background: var(--panel); border-bottom: 1px solid var(--line); }
  .lqe-stat-card { min-width: 0; padding: 12px 20px; border-right: 1px solid var(--line); }
  .lqe-stat-card:last-child { border-right: 0; }
  .lqe-stat-label { font-size: 0.65rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
  .lqe-stat-value { font-family: 'Google Sans Display', sans-serif; font-size: 1.55rem; font-weight: 700; color: var(--accent); line-height: 1.15; }

  .lqe-body { flex: 1; display: flex; min-height: 0; min-width: 0; }
  .lqe-sidebar {
    width: 300px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--line);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow-y: auto;
    transition: width 0.2s ease, padding 0.2s ease, border-color 0.2s ease;
  }
  .lqe-sidebar.hidden { width: 0; padding: 0; border-right-color: transparent; overflow: hidden; }
  .sidebar-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .sidebar-title { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .sidebar-toggle-rail {
    width: 34px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel);
    border-right: 1px solid var(--line);
  }

  .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .overview-box { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 13px 8px; text-align: center; }
  .overview-label { font-size: 0.58rem; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .overview-val { font-family: 'Google Sans Display', sans-serif; font-size: 1.35rem; font-weight: 700; }
  .filter-label { font-size: 0.68rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
  .filter-stack { display: flex; flex-direction: column; gap: 14px; }
  .ai-scope { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--bg); font-size: 0.78rem; color: var(--muted); line-height: 1.4; }

  .lqe-main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  .view-toolbar { height: 44px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .view-tabs { display: flex; gap: 6px; }
  .view-label { color: var(--muted); font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .workspace { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .workspace.map { grid-template-rows: 1fr; }
  .workspace.table { grid-template-rows: 1fr; }
  .lqe-map-container { height: 42%; min-height: 220px; flex-shrink: 0; border-bottom: 1px solid var(--line); position: relative; z-index: 1; overflow: hidden; }
  .workspace.map .lqe-map-container { height: 100%; border-bottom: 0; }
  .workspace.table .lqe-map-container { display: none; }
  .table-resize-handle {
    height: 10px;
    flex-shrink: 0;
    cursor: row-resize;
    background: var(--panel);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    position: relative;
  }
  .table-resize-handle::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 52px;
    height: 3px;
    border-radius: 3px;
    background: var(--muted);
    opacity: 0.45;
    transform: translate(-50%, -50%);
    transition: background 0.15s ease, opacity 0.15s ease;
  }
  .table-resize-handle:hover::before,
  .table-resize-handle.active::before {
    background: var(--accent);
    opacity: 1;
  }
  .lqe-table-container { flex: 1; min-height: 0; padding: 12px; background: var(--table-bg); }
  .workspace.map .lqe-table-container { display: none; }
  .workspace.table .lqe-table-container { flex: 1; }

  .chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
    min-width: 54px;
    height: 50px;
    padding: 0 18px;
    border-radius: 25px;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 26px rgba(0,0,0,0.28);
    font-weight: 700;
  }

  .chat-window {
    position: fixed;
    right: 24px;
    bottom: 84px;
    z-index: 1001;
    width: min(420px, calc(100vw - 32px));
    height: min(520px, calc(100vh - 130px));
    min-width: 300px;
    min-height: 310px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 110px);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 14px 42px rgba(0,0,0,0.45);
    overflow: hidden;
    resize: both;
  }
  .chat-window.large { width: min(680px, calc(100vw - 32px)); height: min(720px, calc(100vh - 110px)); }
  .chat-window.dragging { user-select: none; }
  .chat-header { padding: 12px 14px; background: var(--panel-2); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 10px; cursor: move; touch-action: none; }
  .chat-title { font-weight: 700; font-size: 0.9rem; }
  .chat-tools { display: flex; gap: 6px; cursor: default; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: var(--bg); }
  .msg { width: fit-content; max-width: 88%; padding: 10px 13px; font-size: 0.86rem; line-height: 1.45; word-wrap: break-word; text-align: left; white-space: pre-wrap; }
  .msg.ai { align-self: flex-start; background: var(--panel-2); border: 1px solid var(--line); color: var(--text); border-radius: 14px 14px 14px 3px; }
  .msg.user { align-self: flex-end; background: var(--accent); color: var(--accent-text); font-weight: 500; border-radius: 14px 14px 3px 14px; }
  .thinking { font-style: italic; color: var(--muted); display: flex; gap: 4px; align-items: center; }
  .dot { animation: blink 1.4s infinite both; font-size: 1.4rem; line-height: 0; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
  .chat-input-row { padding: 12px; display: flex; gap: 8px; border-top: 1px solid var(--line); background: var(--panel); }
  .chat-input { flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--line); color: var(--text); padding: 9px 10px; border-radius: 6px; }

  .project-page { flex: 1; min-height: 0; overflow: auto; background: var(--bg); padding: 28px; }
  .project-shell { max-width: 980px; margin: 0 auto; display: grid; gap: 22px; }
  .project-hero { padding: 28px 0 14px; border-bottom: 1px solid var(--line); }
  .project-hero h1 { margin: 0 0 12px; font-size: clamp(2rem, 5vw, 4rem); color: var(--text); line-height: 1; letter-spacing: 0; }
  .project-hero p { max-width: 760px; color: var(--muted); font-size: 1.02rem; line-height: 1.6; }
  .project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .project-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 18px; }
  .project-card h2 { margin: 0 0 8px; font-size: 1rem; color: var(--accent); letter-spacing: 0; }
  .project-card p { margin: 0; color: var(--muted); line-height: 1.5; font-size: 0.92rem; }

  .MuiDataGrid-root { width: 100% !important; border: 1px solid var(--line) !important; border-radius: 8px !important; overflow: hidden; }
  .lqe-root.dark .MuiDataGrid-root { color: #e8e2d4 !important; background: #13161f !important; }
  .lqe-root.light .MuiDataGrid-root { color: #182018 !important; background: #ffffff !important; }
  .lqe-root.dark .MuiDataGrid-columnHeaders, .lqe-root.dark .MuiDataGrid-footerContainer { background: #1a1d26 !important; color: #e8e2d4 !important; }
  .lqe-root.light .MuiDataGrid-columnHeaders, .lqe-root.light .MuiDataGrid-footerContainer { background: #eef1ea !important; color: #182018 !important; }

  @media (max-width: 900px) {
    .lqe-header { height: auto; min-height: 60px; align-items: flex-start; padding: 12px; flex-direction: column; }
    .lqe-actions { justify-content: flex-start; }
    .lqe-stats { grid-template-columns: repeat(2, 1fr); }
    .lqe-sidebar { position: absolute; top: 121px; bottom: 0; z-index: 800; box-shadow: 8px 0 24px rgba(0,0,0,0.25); }
    .project-grid { grid-template-columns: 1fr; }
    .view-toolbar { height: auto; align-items: flex-start; flex-direction: column; }
  }
`;
document.head.appendChild(styleTag);

export default function App() {
  const [isThinking, setIsThinking] = useState(false);
  const [allData, setAllData] = useState([]);
  const [aiRows, setAiRows] = useState(null);
  const [aiScopeLabel, setAiScopeLabel] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [commodityFilter, setCommodityFilter] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLarge, setChatLarge] = useState(false);
  const [chatPosition, setChatPosition] = useState(null);
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('split');
  const [mapHeight, setMapHeight] = useState(42);
  const [isResizingTable, setIsResizingTable] = useState(false);
  const [themeMode, setThemeMode] = useState('dark');
  const [page, setPage] = useState('explorer');
  const [messages, setMessages] = useState([{ role: 'ai', text: 'Ask me anything about quarry permits or local risk scores.' }]);
  const [input, setInput] = useState('');
  const [openSources, setOpenSources] = useState(false);
  const messagesRef = useRef(null);
  const dragRef = useRef(null);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: themeMode,
          primary: { main: themeMode === 'dark' ? '#d4a855' : '#2f7d58' },
          background: {
            paper: themeMode === 'dark' ? '#1a1d26' : '#ffffff',
            default: themeMode === 'dark' ? '#0e1018' : '#f6f7f2',
          },
        },
        typography: { fontFamily: "'Google Sans', system-ui, sans-serif" },
      }),
    [themeMode],
  );

  useEffect(() => {
    fetch(`${API_BASE}/quarries`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load quarry data: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Quarry API did not return a list');
        setAllData(data.map((d, i) => ({ ...d, id: d.id ?? i })));
      })
      .catch((error) => {
        console.error(error);
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: 'I cannot load the quarry database yet. Please start the backend API, then refresh this page.' },
        ]);
      });
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!isDraggingChat) return undefined;

    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;

      const maxLeft = Math.max(8, window.innerWidth - drag.width - 8);
      const maxTop = Math.max(8, window.innerHeight - drag.height - 8);
      const nextLeft = Math.min(Math.max(8, event.clientX - drag.offsetX), maxLeft);
      const nextTop = Math.min(Math.max(8, event.clientY - drag.offsetY), maxTop);
      setChatPosition({ left: nextLeft, top: nextTop });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      setIsDraggingChat(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingChat]);

  useEffect(() => {
    if (!isResizingTable) return undefined;

    const handlePointerMove = (event) => {
      const workspace = document.querySelector('.workspace.split');
      if (!workspace) return;

      const rect = workspace.getBoundingClientRect();
      const nextHeight = ((event.clientY - rect.top) / rect.height) * 100;
      setMapHeight(Math.min(72, Math.max(28, nextHeight)));
    };

    const stopResize = () => setIsResizingTable(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
  }, [isResizingTable]);

  const sourceData = aiRows || allData;

  const filteredData = useMemo(() => {
    return sourceData.filter(
      (d) =>
        (!provinceFilter || d.province === provinceFilter) &&
        (!commodityFilter || d.commodity === commodityFilter),
    );
  }, [sourceData, provinceFilter, commodityFilter]);

  const provinceOptions = useMemo(
    () => [...new Set(allData.map((d) => d.province))].filter(Boolean).sort(),
    [allData],
  );

  const commodityOptions = useMemo(
    () => [...new Set(allData.map((d) => d.commodity))].filter(Boolean).sort(),
    [allData],
  );

  const stats = useMemo(() => {
    const areaSum = filteredData.reduce((acc, d) => acc + (parseFloat(d.area_hectares) || 0), 0);
    return {
      permits: filteredData.length,
      provinces: [...new Set(filteredData.map((d) => d.province).filter(Boolean))].length,
      commodities: [...new Set(filteredData.map((d) => d.commodity).filter(Boolean))].length,
      area: areaSum.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      validated: filteredData.filter((d) => (d.riskScore || 0) > 0).length,
      highRisk: filteredData.filter((d) => (d.riskScore || 0) >= 70).length,
      expired: filteredData.filter((d) => `${d.status || ''} ${d.remarks || ''}`.toLowerCase().includes('expired')).length,
      producing: filteredData.filter((d) => (d.status || '').toLowerCase().includes('producing')).length,
    };
  }, [filteredData]);

  const clearAiScope = () => {
    setAiRows(null);
    setAiScopeLabel('');
  };

  const applyAiRows = (rows, scope) => {
    setAiRows(rows);
    setAiScopeLabel(scope || `AI result set: ${rows.length} matching permits`);
    setProvinceFilter('');
    setCommodityFilter('');
    setPage('explorer');
    if (viewMode === 'table') setViewMode('split');
  };

  const startChatDrag = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button')) return;

    const panel = event.currentTarget.closest('.chat-window');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    setChatPosition({ left: rect.left, top: rect.top });
    setIsDraggingChat(true);
    event.preventDefault();
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setIsThinking(true);
    let localAnswer = '';
    let provinceIntent = { type: 'none', province: '' };

    if (allData.length) {
      provinceIntent = getProvinceIntent(allData, userMsg);
      const preview = buildInteractiveRows(allData, userMsg);
      applyAiRows(preview.rows.map((d, i) => ({ ...d, id: d.id ?? `local-ai-${i}` })), preview.scope);
      localAnswer = buildLocalAnswer(preview, userMsg);
      setMessages((prev) => [...prev, { role: 'ai', text: localAnswer }]);
    }

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg }),
      });
      const data = await res.json();
      const backendAnswer = data.answer || '';
      const backendFailed = backendAnswer.toLowerCase().includes('could not build an answer');
      const backendAnswerAllowed = !['missing', 'outside'].includes(provinceIntent.type);
      if (backendAnswerAllowed && backendAnswer && !backendFailed && backendAnswer !== localAnswer) {
        setMessages((prev) => [...prev, { role: 'ai', text: backendAnswer }]);
      } else if (!localAnswer && backendFailed) {
        setMessages((prev) => [...prev, { role: 'ai', text: 'I could not build an answer for that question.' }]);
      }

      if (Array.isArray(data.rows)) {
        const rows = data.rows.map((d, i) => ({ ...d, id: d.id ?? `ai-${i}` }));
        const backendRowsMatchProvince = provinceIntent.type === 'none' || (provinceIntent.type === 'matched' && rows.every((row) => row.province === provinceIntent.province));
        if (backendRowsMatchProvince) {
          applyAiRows(rows, data.scope);
        }
      }
    } catch {
      if (!localAnswer) {
        setMessages((prev) => [...prev, { role: 'ai', text: 'Hikarizz AI connection lost.' }]);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!filteredData.length) return;
    const headers = Object.keys(filteredData[0]);
    const csvRows = [
      headers.join(','),
      ...filteredData.map((row) => headers.map((field) => `"${String(row[field] ?? '').replaceAll('"', '""')}"`).join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'quarry_data.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const renderExplorer = () => (
    <>
      <section className="lqe-stats">
        <div className="lqe-stat-card"><div className="lqe-stat-label">Total Permits</div><div className="lqe-stat-value">{stats.permits}</div></div>
        <div className="lqe-stat-card"><div className="lqe-stat-label">Provinces</div><div className="lqe-stat-value">{stats.provinces}</div></div>
        <div className="lqe-stat-card"><div className="lqe-stat-label">Commodities</div><div className="lqe-stat-value">{stats.commodities}</div></div>
        <div className="lqe-stat-card"><div className="lqe-stat-label">Total Area</div><div className="lqe-stat-value">{stats.area}</div></div>
      </section>

      <div className="lqe-body">
        {!sidebarOpen && (
          <div className="sidebar-toggle-rail">
            <Tooltip title="Show sidebar" placement="right">
              <IconButton size="small" color="primary" onClick={() => setSidebarOpen(true)} aria-label="Show sidebar">
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        )}

        <aside className={`lqe-sidebar ${sidebarOpen ? '' : 'hidden'}`} aria-hidden={!sidebarOpen}>
          <div className="sidebar-head">
            <div className="sidebar-title">
              <div className="filter-label">Sidebar</div>
              <div className="view-label">Filters and overview</div>
            </div>
            <Tooltip title="Hide sidebar">
              <IconButton size="small" color="primary" onClick={() => setSidebarOpen(false)} aria-label="Hide sidebar">
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>

          <div>
            <div className="filter-label" style={{ marginBottom: '8px' }}>Overview</div>
            <div className="overview-grid">
              <div className="overview-box"><div className="overview-label">Validated</div><div className="overview-val" style={{ color: 'var(--accent)' }}>{stats.validated}</div></div>
              <div className="overview-box"><div className="overview-label">High Risk</div><div className="overview-val" style={{ color: '#ef4444' }}>{stats.highRisk}</div></div>
              <div className="overview-box"><div className="overview-label">Expired</div><div className="overview-val" style={{ color: '#f59e0b' }}>{stats.expired}</div></div>
              <div className="overview-box"><div className="overview-label">Producing</div><div className="overview-val" style={{ color: '#22c55e' }}>{stats.producing}</div></div>
            </div>
          </div>

          {aiRows && (
            <div className="ai-scope">
              <strong style={{ color: 'var(--text)' }}>AI filtered view</strong>
              <div>{aiScopeLabel}</div>
              <Button size="small" sx={{ mt: 1 }} onClick={clearAiScope}>Show all data</Button>
            </div>
          )}

          <div className="filter-stack">
            <FormControl size="small" fullWidth>
              <InputLabel id="province-label">Province</InputLabel>
              <Select
                labelId="province-label"
                value={provinceFilter}
                label="Province"
                onChange={(e) => setProvinceFilter(e.target.value)}
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">All Provinces</MenuItem>
                {provinceOptions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="commodity-label">Commodity</InputLabel>
              <Select
                labelId="commodity-label"
                value={commodityFilter}
                label="Commodity"
                onChange={(e) => setCommodityFilter(e.target.value)}
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">All Commodities</MenuItem>
                {commodityOptions.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>

            <Button variant="contained" sx={{ fontWeight: 700, padding: '10px' }} onClick={handleDownloadCSV}>
              Download CSV
            </Button>
          </div>
        </aside>

        <main className="lqe-main">
          <div className="view-toolbar">
            <div className="view-tabs">
              {['split', 'map', 'table'].map((mode) => (
                <Button key={mode} size="small" variant={viewMode === mode ? 'contained' : 'outlined'} onClick={() => setViewMode(mode)}>
                  {mode === 'split' ? 'Split' : mode === 'map' ? 'Map' : 'Table'}
                </Button>
              ))}
            </div>
            <div className="view-label">{aiRows ? aiScopeLabel : 'Showing current filters across the full quarry dataset'}</div>
          </div>

          <div className={`workspace ${viewMode}`}>
            <div className="lqe-map-container" style={viewMode === 'split' ? { height: `${mapHeight}%` } : undefined}>
              <MapContainer
                center={phCenter}
                zoom={6}
                minZoom={5}
                maxBounds={phBounds}
                maxBoundsViscosity={1}
                style={{ height: '100%', width: '100%' }}
              >
                <MapResizeWatcher watch={`${viewMode}-${sidebarOpen}-${filteredData.length}-${mapHeight}`} />
                <MapFitToRows rows={filteredData} />
                <TileLayer url={mapTiles[themeMode]} />
                {filteredData.filter((d) => d.latitude && d.longitude).map((d) => (
                  <CircleMarker
                    key={d.id}
                    center={[d.latitude, d.longitude]}
                    radius={6}
                    pathOptions={{ color: getRiskColor(d.riskScore), fillColor: getRiskColor(d.riskScore), fillOpacity: 0.72 }}
                  >
                    <LeafletTooltip><b>{d.contractor}</b><br />{d.province} - {d.commodity}<br />Risk: {d.riskScore}</LeafletTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {viewMode === 'split' && (
              <div
                className={`table-resize-handle ${isResizingTable ? 'active' : ''}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setIsResizingTable(true);
                  event.preventDefault();
                }}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize map and table"
                title="Drag to resize map and table"
              />
            )}

            <div className="lqe-table-container">
              <DataGrid
                rows={filteredData}
                columns={[
                  { field: 'contractor', headerName: 'Company / Contractor', minWidth: 250, flex: 2 },
                  { field: 'province', headerName: 'Province', minWidth: 150, flex: 1 },
                  { field: 'municipality', headerName: 'Municipality', minWidth: 150, flex: 1 },
                  { field: 'commodity', headerName: 'Commodity', minWidth: 220, flex: 2 },
                  { field: 'status', headerName: 'Status', minWidth: 170, flex: 1.5 },
                  { field: 'riskScore', headerName: 'Risk', minWidth: 90, flex: 0.6 },
                  { field: 'area_hectares', headerName: 'Area (Ha)', minWidth: 110, flex: 0.8 },
                  { field: 'date_approved', headerName: 'Approved', minWidth: 130, flex: 1 },
                ]}
                rowHeight={52}
                density="standard"
                disableRowSelectionOnClick
              />
            </div>
          </div>
        </main>
      </div>
    </>
  );

  const renderProjectPage = () => (
    <section className="project-page">
      <div className="project-shell">
        <div className="project-hero">
          <h1>Why We Are Making This Project</h1>
          <p>
            Hikarizz turns quarry permit records into a practical decision-support tool. The goal is to help students,
            researchers, local offices, and communities quickly see where quarry activity is happening, what permits may
            need attention, and how environmental risk patterns appear across provinces and commodities.
          </p>
        </div>
        <div className="project-grid">
          <div className="project-card">
            <h2>Make Records Easier To Understand</h2>
            <p>Raw permit tables are hard to scan. This explorer connects records to maps, filters, and summary metrics so the dataset becomes easier to interpret.</p>
          </div>
          <div className="project-card">
            <h2>Support Responsible Quarrying</h2>
            <p>The system highlights status, area, commodity, and risk indicators to encourage better monitoring and more informed environmental conversations.</p>
          </div>
          <div className="project-card">
            <h2>Use AI As A Guide</h2>
            <p>The AI assistant explains patterns in plain language and now updates the map and table so answers stay connected to the actual records.</p>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <div className={`lqe-root ${themeMode}`}>
        <header className="lqe-header">
          <div className="lqe-logo">Land Quarry Explorer <span className="lqe-badge">HIKARIZZ 2026</span></div>
          <div className="lqe-actions">
            <Button variant={page === 'explorer' ? 'contained' : 'outlined'} size="small" onClick={() => setPage('explorer')}>Explorer</Button>
            <Button variant={page === 'why' ? 'contained' : 'outlined'} size="small" onClick={() => setPage('why')}>Why This Project</Button>
            <Tooltip title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton color="primary" onClick={() => setThemeMode((value) => (value === 'dark' ? 'light' : 'dark'))} aria-label="Toggle color mode">
                {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Button variant="outlined" size="small" onClick={() => setOpenSources(true)}>Sources</Button>
          </div>
        </header>

        {page === 'explorer' ? renderExplorer() : renderProjectPage()}

        <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)}>
          <span>{chatOpen ? 'X' : 'AI'}</span>
          {!chatOpen && <span>Ask Hikarizz AI</span>}
        </button>

        {chatOpen && (
          <div
            className={`chat-window ${chatLarge ? 'large' : ''} ${isDraggingChat ? 'dragging' : ''}`}
            style={chatPosition ? { left: chatPosition.left, top: chatPosition.top, right: 'auto', bottom: 'auto' } : undefined}
          >
            <div className="chat-header" onPointerDown={startChatDrag}>
              <div className="chat-title">Hikarizz AI Assistant</div>
              <div className="chat-tools">
                <Button size="small" variant="outlined" onClick={() => setChatLarge((value) => !value)}>
                  {chatLarge ? 'Compact' : 'Expand'}
                </Button>
                <Button size="small" variant="outlined" onClick={() => setChatOpen(false)}>Close</Button>
              </div>
            </div>
            <div className="chat-messages" ref={messagesRef}>
              {messages.map((m, i) => <div key={`${m.role}-${i}`} className={`msg ${m.role}`}>{m.text}</div>)}
              {isThinking && (
                <div className="msg ai thinking">
                  <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                </div>
              )}
            </div>
            <div className="chat-input-row">
              <input
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Message AI..."
              />
              <Button variant="contained" size="small" onClick={handleSend}>Send</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={openSources} onClose={() => setOpenSources(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Sources & Transparency</DialogTitle>
        <DialogContent dividers>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.6, textAlign: 'center' }}>
            The data used in this system is sourced from the official records of the<br /><br />
            <b>MINES AND GEOSCIENCES BUREAU</b><br />
            REGIONAL OFFICE<br />
            DIRECTORY OF OPERATING MINES AND QUARRIES
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSources(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
