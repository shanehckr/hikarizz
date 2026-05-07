import { useEffect, useMemo, useRef, useState } from 'react';
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
import DOMPurify from 'dompurify';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ChatBubbleOutlinedIcon from '@mui/icons-material/ChatBubbleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import SendIcon from '@mui/icons-material/Send';
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
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      map.fire('resize');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map, watch]);

  return null;
}

function MapBoundsLimiter() {
  const map = useMap();

  useEffect(() => {
    const applyBounds = () => {
      const minZoom = map.getBoundsZoom(phBounds, true);
      map.setMinZoom(minZoom);
      map.setMaxBounds(phBounds);

      if (map.getZoom() < minZoom) {
        map.setZoom(minZoom, { animate: false });
      }

      map.panInsideBounds(phBounds, { animate: false });
    };

    const timer = window.setTimeout(() => {
      map.invalidateSize();
      applyBounds();
    }, 0);

    map.on('resize', applyBounds);

    return () => {
      window.clearTimeout(timer);
      map.off('resize', applyBounds);
    };
  }, [map]);

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
          lng <= phBounds[1][1]
      );

    if (points.length === 0) {
      map.fitBounds(phBounds, { padding: [12, 12], animate: false });
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 11, { animate: false });
      return;
    }

    map.fitBounds(points, { padding: [40, 40], animate: false, maxZoom: 11 });
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

const GREETING_PATTERNS = /^(hello|hi|hey|kumusta|kamusta|magandang|good morning|good afternoon|good evening|musta|sup|yo|helo|huy|oy)\b/i;

const DATA_LOOKUP_PATTERNS = /show|list|find|where|which|who|how many|count|records?|permit holders?|contractors?|operators?|province|municipalit|barangay|location|region|commodit|status|expired|expire|expiration|approved|date|risk|score|producing|suspended|operation|area|hectare|quarr|sand|gravel|limestone|basalt|shale|andesite|silica|gold|copper/i;

const QUARRY_CONCEPTUAL_PATTERNS = /how.*work|paano|bakit|why|what is|ano ang|explain|define|meaning|kahulugan|calculate|computed|formula|environmental|danger|hazard|permit|quarry|quarrying|risk score/i;

const OUT_OF_SCOPE_PATTERNS = /weather|sports|politics|cooking|recipe|movie|music|celebrity|stock|crypto|bitcoin|fashion|travel|hotel|flight|covid|vaccine|news|football|basketball|nba|nfl/i;

const DATA_SCOPE_MESSAGE = [
  'I\'m the Quarry Land Assistant — I can only help with questions about Philippine land quarry permits and data.',
  '',
  'You can ask me about:',
  '* Permit holders or contractors',
  '* Provinces, municipalities, and locations',
  '* Commodities such as sand, gravel, limestone, or basalt',
  '* Operating status — producing, suspended, no operation',
  '* Risk scores and how they are calculated',
  '* Expiration dates and permit details',
  '',
  'Try asking: "What are the high risk quarries in Batangas?" or "Paano kinukwenta ang risk score?"',
].join('\n');

const GREETING_REPLY = [
  'Hi! I\'m the Quarry Land Assistant 👋',
  '',
  'I can help you explore Philippine quarry permit data. Ask me about:',
  '* Specific quarries, contractors, or locations',
  '* Risk scores and what makes a quarry high risk',
  '* Permit status — producing, suspended, or expired',
  '* Commodities like sand, gravel, or limestone',
  '',
  'What would you like to know?',
].join('\n');

function classifyQuestion(question) {
  const q = question.trim().toLowerCase();

  // Greetings
  if (GREETING_PATTERNS.test(q) && q.split(' ').length <= 5) return 'greeting';

  // Completely out of scope topics
  if (OUT_OF_SCOPE_PATTERNS.test(q) && !QUARRY_CONCEPTUAL_PATTERNS.test(q)) return 'out_of_scope';

  // Quarry conceptual questions - about how things work, not data lookup
  if (QUARRY_CONCEPTUAL_PATTERNS.test(q)) return 'quarry_related';

  // Data lookup questions
  if (DATA_LOOKUP_PATTERNS.test(q)) return 'data_question';

  return 'out_of_scope';
}

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
      availableProvinces: [...new Set(rows.map((row) => row.province).filter(Boolean))].sort(),
    };
  }

  if (provinceIntent.type === 'outside') {
    return {
      rows: [],
      scope: `AI preview: 0 matching permits for ${provinceIntent.province}`,
      requestedPlace: provinceIntent.province,
      availableProvinces: [...new Set(rows.map((row) => row.province).filter(Boolean))].sort(),
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
    const today = new Date().toISOString().split('T')[0];
    textMatches = textMatches.concat(baseRows.filter((row) => {
      const statusText = `${row.status || ''} ${row.remarks || ''}`.toLowerCase();
      return statusText.match(/expired|renewal/) || (row.date_expired && row.date_expired < today);
    }));
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
  let scoped;

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
    const provinceList = (preview.availableProvinces || []).slice(0, 12).join(', ');
    const provinceSuffix = provinceList ? ` Available provinces include: ${provinceList}${(preview.availableProvinces || []).length > 12 ? ', and more' : ''}.` : '';
    if (preview.requestedProvince) {
      return `I could not find quarry records for ${preview.requestedProvince} in the local dataset.${provinceSuffix}`;
    }
    if (preview.requestedPlace) {
      return `I could not find quarry records for ${preview.requestedPlace}. This assistant only uses the Philippine quarry permit dataset loaded in this app.${provinceSuffix}`;
    }
    return 'I could not find matching quarry records in the local dataset for that question.';
  }

  const uniqueValues = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
  const municipalities = uniqueValues('municipality');
  const provinces = uniqueValues('province');
  const commodities = uniqueValues('commodity');
  const highRisk = rows.filter((row) => Number(row.riskScore || 0) >= 70).length;
  const wantsExpiredDates = /expired|expire|expiration/.test(q) && /date|when|list|show/.test(q);

  if (wantsExpiredDates) {
    const withDates = rows
      .filter((row) => row.date_expired)
      .sort((a, b) => String(a.date_expired).localeCompare(String(b.date_expired)))
      .slice(0, 20);

    if (!withDates.length) {
      return `${preview.scope}.\n\nI found matching quarry records, but they do not include expiration dates in the local dataset.`;
    }

    return `${preview.scope}.\n\nExpiration dates:\n${withDates
      .map((row) => `* ${row.date_expired} - ${row.contractor || row.operator || 'Unknown permit holder'} (${row.municipality || 'Unknown municipality'}, ${row.province || 'Unknown province'}; ${row.status || 'Unknown status'})`)
      .join('\n')}`;
  }

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

// ── Markdown-lite renderer for chat messages ──────────────────────────────────
function renderMessageText(text) {
  if (!text) return null;
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n');
    const isList = lines.every(l => l.trim() === '' || /^[*-]/.test(l.trim()));
    if (isList) {
      const items = lines.filter(l => l.trim());
      return (
        <ul key={pi} style={{ margin: '4px 0 4px 0', paddingLeft: '18px' }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: '3px' }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  item
                    .replace(/^[*-]\s*/, '')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                )
              }}
            />
          ))}
        </ul>
      );
    }
    return (
      <p key={pi} style={{ margin: pi === 0 ? '0 0 6px' : '6px 0' }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(
            para
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\n/g, '<br/>')
          )
        }}

      />
    );
  });
}

const SAMPLE_QUESTIONS = [
  'High-risk quarries in Batangas?',
  'Suspended operations in Cebu?',
  'Paano kinukwenta ang risk score?',
  'Most expired permits by province?',
  'Limestone quarries in La Union?',
];

const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href =
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Google+Sans+Display:wght@400;700&display=swap';
document.head.appendChild(fontLink);

const styleTag = document.createElement('style');
styleTag.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100vh; width: 100vw; margin: 0; overflow: hidden; font-family: 'Google Sans', system-ui, sans-serif; }
  body { background: #f4f7f1; }
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
    font-size: clamp(14px, 0.85vw, 16px);
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
    height: 56px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 18px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .lqe-logo { font-family: 'Google Sans Display', sans-serif; font-size: 1.28rem; font-weight: 700; color: var(--text); white-space: nowrap; text-align: left; }
  .lqe-badge { font-size: 0.62rem; background: var(--accent); color: var(--accent-text); padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
  .lqe-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .lqe-actions .MuiButton-root { min-height: 34px; padding: 5px 12px; font-size: 0.84rem; }

  .lqe-stats { flex-shrink: 0; display: grid; grid-template-columns: repeat(4, 1fr); background: var(--panel); border-bottom: 1px solid var(--line); }
  .lqe-stat-card { min-width: 0; padding: 10px 16px; border-right: 1px solid var(--line); text-align: center; }
  .lqe-stat-card:last-child { border-right: 0; }
  .lqe-stat-label { font-size: 0.62rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
  .lqe-stat-value { font-family: 'Google Sans Display', sans-serif; font-size: 1.38rem; font-weight: 700; color: var(--accent); line-height: 1.12; }

  .lqe-body { flex: 1; display: flex; min-height: 0; min-width: 0; }
  .lqe-sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--line);
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.2s ease, padding 0.2s ease, border-color 0.2s ease;
  }
  .lqe-sidebar.hidden { width: 0; padding: 0; border-right-color: transparent; overflow: hidden; }
  .sidebar-panel {
    flex: 1 1 auto;
    max-height: 100%;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 13px;
    overflow-y: auto;
    background: var(--panel);
  }
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

  .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .overview-box { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 8px; text-align: center; color: inherit; cursor: pointer; }
  .overview-box:hover,
  .overview-box.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .overview-label { font-size: 0.58rem; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px; }
  .overview-val { font-family: 'Google Sans Display', sans-serif; font-size: 1.22rem; font-weight: 700; color: var(--accent); }
  .filter-label { font-size: 0.68rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
  .filter-stack { display: flex; flex-direction: column; gap: 11px; }
  .filter-stack .MuiButton-root { min-height: 36px; padding: 7px 10px; font-size: 0.8rem; }
  .filter-stack .MuiFormControl-root { min-width: 0; }
  .filter-stack .MuiInputLabel-root {
    max-width: calc(100% - 24px);
    padding: 0 4px;
    background: var(--panel);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .filter-stack .MuiSelect-select {
    min-width: 0;
    min-height: 22px;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .filter-value {
    display: block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-scope { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--bg); font-size: 0.78rem; color: var(--muted); line-height: 1.4; }

  .lqe-main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  .view-toolbar { height: 40px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .view-tabs { display: flex; gap: 6px; }
  .view-tabs .MuiButton-root { min-height: 30px; padding: 4px 12px; font-size: 0.78rem; }
  .view-label { color: var(--muted); font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .workspace { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .workspace.map { grid-template-rows: 1fr; }
  .workspace.table { grid-template-rows: 1fr; }
  .lqe-map-container { height: 34%; min-height: 210px; flex-shrink: 0; border-bottom: 1px solid var(--line); position: relative; z-index: 1; overflow: hidden; }
  .workspace.map .lqe-map-container { height: 100%; border-bottom: 0; }
  .workspace.table .lqe-map-container { display: none; }
  .table-resize-handle {
    height: 8px;
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
  .lqe-table-container { flex: 1; min-height: 0; padding: 8px 10px; background: var(--table-bg); }
  .workspace.map .lqe-table-container { display: none; }
  .workspace.table .lqe-table-container { flex: 1; }

  .chat-widget {
    position: fixed;
    bottom: 43px;
    left: 60px;
    right: auto;
    z-index: 1000;
    width: 360px;
    max-width: calc(1000vw - 28px);
  }

  .chat-fab {
    position: relative;
    z-index: 2;
    min-width: 178px;
    height: 44px;
    padding: 0 16px;
    border-radius: 22px;
    background: linear-gradient(135deg, #57ae6e, #663f27);
    color: #ffffff;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(14px);
    border: 5px solid rgba(255,255,255,0.15);
    box-shadow: 0 8px 32px rgba(6,95,70,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 9px;
    box-shadow: 0 10px 28px rgba(0,0,0,0.22);
    font-weight: 700;
    font-size: 0.82rem;
    text-transform: none;
    letter-spacing: 0;
    touch-action: none;
  }

  .chat-fab:hover {
    background: linear-gradient(135deg, #0d6b63, #21a07c);
    box-shadow: 0 12px 32px rgba(59, 168, 159, 0.55), inset 0 1px 0 rgba(255,255,255,0.25);
    outline-color: rgba(15,118,110,0.6);
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }

 .chat-widget.open .chat-fab {
    min-width: 56px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    padding: 0;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    align-self: flex-end;
  }
  .chat-fab {
    align-self: flex-start;
  }
  .chat-fab svg { font-size: 1.05rem; }
  .chat-fab.dragging {
    user-select: none;
    filter: brightness(0.9);
  }
  .chat-window {
    position: absolute;
    bottom: calc(80% + 8px);
    left: 0;
    z-index: 999;
    width: 340px; // initial width when opened
    height: 250px;
    min-height: 100px;
    max-height: calc(100vh - 220px);
    margin-bottom: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 18px 48px rgba(0,0,0,0.36);
    overflow: hidden;
  }
  .chat-widget.open-right .chat-window {
    left: 0;
    right: auto;
    border-radius: 14px 14px 14px 0;
  }
  .chat-window.large { width: min(440px, calc(100vw - 32px)); height: min(790px, calc(100vh - 110px)); resize: both; }
  .chat-window.dragging { user-select: none; }
  .chat-header { padding: 10px 12px; background: var(--panel); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: move; touch-action: none; }
  .chat-title { min-width: 0; flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 8px; font-weight: 700; font-size: 0.85rem; text-align: left; white-space: nowrap; overflow: hidden; }
  .chat-title-icon { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--accent); color: var(--accent-text); }
  .chat-title-text { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; overflow: hidden; }
  .chat-title-text > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chat-title-sub { color: var(--muted); font-size: 0.65rem; font-weight: 500; margin-top: 1px; white-space: nowrap; }
  .chat-tools { display: flex; gap: 2px; cursor: default; flex-shrink: 0; }
  .chat-tools .MuiIconButton-root { width: 28px; height: 28px; border: 1px solid var(--line); border-radius: 6px; }
  .chat-messages { flex: 0 1 auto; min-height: 112px; max-height: min(320px, calc(100vh - 240px)); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--bg); }
  .chat-window.large .chat-messages { flex: 1; max-height: none; }
  .msg { width: 360px; max-width: min(88%, 560px); padding: 10px 13px; font-size: 0.86rem; line-height: 1.45; word-wrap: break-word; text-align: left; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
  .msg.ai { align-self: flex-start; background: var(--panel); border: 1px solid var(--line); color: var(--text); border-radius: 14px 14px 14px 4px; }
  .msg.user { align-self: flex-end; background: var(--accent); color: var(--accent-text); font-weight: 500; border-radius: 14px 14px 4px 14px; }
  .thinking { font-style: normal; color: var(--muted); display: flex; align-items: center; gap: 8px; font-size: 0.82rem; }
  .thinking-dots { display: flex; gap: 4px; align-items: center; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: blink 1.4s infinite both; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.2; transform: scale(0.8); } }
  .chat-input-row { padding: 12px; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--line); background: var(--panel); }
  .chat-input { flex: 1; min-width: 0; height: 40px; background: var(--bg); border: 1px solid var(--line); color: var(--text); padding: 0 12px; border-radius: 20px; outline: none; }
  .chat-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
  .chat-send-button.MuiIconButton-root { width: 40px; height: 40px; flex-shrink: 0; background: var(--accent); color: var(--accent-text); }
  .chat-send-button.MuiIconButton-root:hover { background: var(--accent); filter: brightness(0.96); }
  .chat-send-button.Mui-disabled { opacity: 0.45; }

  .project-page { flex: 1; min-height: 0; overflow: auto; background: var(--bg); padding: 28px; }
  .project-shell { max-width: 980px; margin: 0 auto; display: grid; gap: 22px; }
  .project-hero { padding: 34px 0 20px; border-bottom: 1px solid var(--line); text-align: center; }
  .project-hero h1 {
    max-width: 860px;
    margin: 0 auto 14px;
    font-size: clamp(2.1rem, 4.2vw, 3.45rem);
    color: var(--text);
    line-height: 1.08;
    letter-spacing: 0;
  }
  .project-hero p {
    max-width: 780px;
    margin: 0 auto;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.6;
  }
  .project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .project-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 18px; text-align: left; }
  .project-card h2 { margin: 0 0 8px; font-size: 1rem; color: var(--accent); letter-spacing: 0; line-height: 1.25; }
  .project-card p { margin: 0; color: var(--muted); line-height: 1.5; font-size: 0.92rem; }

  .MuiDataGrid-root { width: 100% !important; border: 1px solid var(--line) !important; border-radius: 8px !important; overflow: hidden; font-size: 0.8rem !important; }
  .MuiDataGrid-columnHeader,
  .MuiDataGrid-cell { padding-left: 8px !important; padding-right: 8px !important; }
  .MuiDataGrid-columnHeaderTitle { font-weight: 700 !important; }
  .MuiDataGrid-footerContainer {
    min-height: 34px !important;
    height: 34px !important;
    overflow: hidden !important;
  }
  .MuiTablePagination-root,
  .MuiTablePagination-toolbar {
    min-height: 34px !important;
    height: 34px !important;
  }
  .MuiTablePagination-toolbar {
    padding-left: 8px !important;
    padding-right: 8px !important;
  }
  .MuiTablePagination-selectLabel,
  .MuiTablePagination-displayedRows {
    margin: 0 !important;
    font-size: 0.72rem !important;
  }
  .MuiTablePagination-input {
    margin-right: 12px !important;
    font-size: 0.72rem !important;
  }
  .lqe-root.dark .MuiDataGrid-root { color: #e8e2d4 !important; background: #13161f !important; }
  .lqe-root.light .MuiDataGrid-root { color: #182018 !important; background: #ffffff !important; }
  .lqe-root.dark .MuiDataGrid-columnHeaders, .lqe-root.dark .MuiDataGrid-footerContainer { background: #1a1d26 !important; color: #e8e2d4 !important; }
  .lqe-root.light .MuiDataGrid-columnHeaders, .lqe-root.light .MuiDataGrid-footerContainer { background: #eef1ea !important; color: #182018 !important; }

  @media (max-width: 900px) {
    .lqe-header { height: auto; min-height: 52px; align-items: center; padding: 8px 10px; gap: 8px; }
    .lqe-logo { flex: 1 1 auto; min-width: 0; font-size: clamp(0.95rem, 3vw, 1.2rem); overflow: hidden; text-overflow: ellipsis; text-align: left; }
    .lqe-badge { font-size: 0.52rem; margin-left: 5px; padding: 2px 5px; }
    .lqe-actions { flex: 0 0 auto; gap: 6px; justify-content: flex-end; flex-wrap: nowrap; }
    .lqe-actions .MuiButton-root { min-width: 0; padding: 5px 8px; font-size: 0.68rem; }
    .lqe-actions .MuiIconButton-root { padding: 5px; }
    .lqe-stats { grid-template-columns: repeat(2, 1fr); }
    .lqe-body { position: relative; }
    .lqe-sidebar { position: absolute; top: 0; bottom: 0; width: min(300px, calc(100vw - 44px)); max-width: calc(100vw - 44px); z-index: 800; box-shadow: 8px 0 24px rgba(0,0,0,0.25); }
    .sidebar-toggle-rail { width: 38px; }
    .project-grid { grid-template-columns: 1fr; }
    .view-toolbar { height: auto; align-items: flex-start; flex-direction: column; }
    .chat-widget { left: max(8px, calc((min(300px, calc(100vw - 44px)) - 178px) / 2)); }
  }

  @media (min-width: 1800px) {
    .lqe-root { font-size: 18px; }
    .lqe-header { height: 70px; }
    .lqe-logo { font-size: 1.55rem; }
    .lqe-sidebar { width: 340px; }
    .sidebar-panel { padding: 22px; }
    .lqe-map-container { min-height: 300px; }
    .MuiDataGrid-root { font-size: 0.9rem !important; }
  }

  .sample-questions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .sample-q {
    font-family: inherit;
    font-size: 0.72rem;
    background: var(--panel-2);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 14px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    text-align: left;
    line-height: 1.3;
  }
  .sample-q:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
  }

  .msg.ai strong { color: var(--text); }
  .msg.ai ul { list-style: disc; }
  .msg.ai p:last-child { margin-bottom: 0; }

  @media (max-width: 560px) {
    .lqe-actions { gap: 4px; }
    .lqe-actions .MuiButton-root { padding: 5px 6px; font-size: 0.62rem; }
    .lqe-badge { display: none; }
    .lqe-sidebar { width: calc(100vw - 38px); max-width: calc(100vw - 38px); }
    .sidebar-panel { padding: 14px; }
    .filter-stack { gap: 12px; }
    .chat-widget { left: max(8px, calc((100vw - 216px) / 2)); }
  }
`;
document.head.appendChild(styleTag);

export default function App() {
  const [isThinking, setIsThinking] = useState(false);
  const [allData, setAllData] = useState([]);
  const [aiRows, setAiRows] = useState(null);
  const [aiScopeLabel, setAiScopeLabel] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [commodityFilter, setCommodityFilter] = useState('');
  const [overviewFilter, setOverviewFilter] = useState('');

  // Chat States
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLarge, setChatLarge] = useState(false);
  const [chatPosition, setChatPosition] = useState(null);
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const fabClickPreventRef = useRef(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('split');
  const [mapHeight, setMapHeight] = useState(34);
  const [isResizingTable, setIsResizingTable] = useState(false);
  const [themeMode, setThemeMode] = useState('light');
  const [page, setPage] = useState('explorer');
  const [messages, setMessages] = useState([{ role: 'ai', text: 'Ask me anything about quarry permits or local risk scores.' }]);
  const [input, setInput] = useState('');
  const [openSources, setOpenSources] = useState(false);

  const messagesRef = useRef(null);
  const dragRef = useRef(null);
  const defaultChatLeft = window.innerWidth <= 560
    ? Math.max(8, (window.innerWidth - 216) / 2)
    : window.innerWidth <= 900
      ? Math.max(8, (Math.min(300, window.innerWidth - 44) - 178) / 2)
      : 51;
  const chatPopupWidth = chatLarge
    ? Math.min(680, window.innerWidth - 32)
    : Math.min(380, window.innerWidth - 32);
  const chatWidgetLeft = chatPosition?.left ?? defaultChatLeft;
  const chatWidgetWidth = 178;
  const shouldOpenChatRight = chatWidgetLeft + chatWidgetWidth - chatPopupWidth < 8;

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

  // Handle Chat Window Dragging
  useEffect(() => {
    if (!isDraggingChat) return undefined;

    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
        fabClickPreventRef.current = true;
      }

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
      setMapHeight(Math.min(64, Math.max(24, nextHeight)));
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
  const sortedUniqueValues = (rows, field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );

  const yearOptions = useMemo(
    () => sortedUniqueValues(sourceData, 'year'),
    [sourceData],
  );

  const regionOptions = useMemo(
    () => sortedUniqueValues(
      sourceData.filter((d) => !yearFilter || String(d.year) === String(yearFilter)),
      'region',
    ),
    [sourceData, yearFilter],
  );

  const provinceOptions = useMemo(
    () => sortedUniqueValues(
      sourceData.filter(
        (d) =>
          (!yearFilter || String(d.year) === String(yearFilter)) &&
          (!regionFilter || d.region === regionFilter),
      ),
      'province',
    ),
    [sourceData, yearFilter, regionFilter],
  );

  const municipalityOptions = useMemo(
    () => sortedUniqueValues(
      sourceData.filter(
        (d) =>
          (!yearFilter || String(d.year) === String(yearFilter)) &&
          (!regionFilter || d.region === regionFilter) &&
          (!provinceFilter || d.province === provinceFilter),
      ),
      'municipality',
    ),
    [sourceData, yearFilter, regionFilter, provinceFilter],
  );

  const commodityOptions = useMemo(
    () => sortedUniqueValues(sourceData, 'commodity'),
    [sourceData],
  );

  const baseFilteredData = useMemo(() => {
    return sourceData.filter(
      (d) =>
        (!yearFilter || String(d.year) === String(yearFilter)) &&
        (!regionFilter || d.region === regionFilter) &&
        (!provinceFilter || d.province === provinceFilter) &&
        (!municipalityFilter || d.municipality === municipalityFilter) &&
        (!commodityFilter || d.commodity === commodityFilter),
    );
  }, [sourceData, yearFilter, regionFilter, provinceFilter, municipalityFilter, commodityFilter]);

  const filteredData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    if (overviewFilter === 'producing') {
      return baseFilteredData.filter((d) => (d.status || '').toLowerCase() === 'producing');
    }
    if (overviewFilter === 'expired') {
      return baseFilteredData.filter((d) => d.date_expired && d.date_expired < today);
    }
    if (overviewFilter === 'noOperation') {
      return baseFilteredData.filter((d) => (d.remarks || '').toLowerCase() === 'no operation');
    }
    if (overviewFilter === 'suspended') {
      return baseFilteredData.filter((d) => (d.remarks || '').toLowerCase() === 'suspended');
    }

    return baseFilteredData;
  }, [baseFilteredData, overviewFilter]);

  const stats = useMemo(() => {
    const areaSum = baseFilteredData.reduce((acc, d) => acc + (parseFloat(d.area_hectares) || 0), 0);
    const today = new Date().toISOString().split('T')[0];
    return {
      permits: baseFilteredData.length,
      provinces: [...new Set(baseFilteredData.map((d) => d.province).filter(Boolean))].length,
      commodities: [...new Set(baseFilteredData.map((d) => d.commodity).filter(Boolean))].length,
      area: areaSum.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      producing: baseFilteredData.filter((d) => (d.status || '').toLowerCase() === 'producing').length,
      expired: baseFilteredData.filter((d) => d.date_expired && d.date_expired < today).length,
      noOperation: baseFilteredData.filter((d) => (d.remarks || '').toLowerCase() === 'no operation').length,
      suspended: baseFilteredData.filter((d) => (d.remarks || '').toLowerCase() === 'suspended').length,
    };
  }, [baseFilteredData]);

  const clearAiScope = () => {
    setAiRows(null);
    setAiScopeLabel('');
  };

  const toggleOverviewFilter = (value) => {
    setOverviewFilter((current) => (current === value ? '' : value));
  };

  const applyAiRows = (rows, scope) => {
    setAiRows(rows);
    setAiScopeLabel(scope || `AI result set: ${rows.length} matching permits`);
    setYearFilter('');
    setRegionFilter('');
    setProvinceFilter('');
    setMunicipalityFilter('');
    setCommodityFilter('');
    setOverviewFilter('');
    setPage('explorer');
    if (viewMode === 'table') setViewMode('split');
  };

  const startChatDrag = (event) => {
    if (event.button !== 0) return;
    if (event.currentTarget.classList.contains('chat-header') && event.target.closest('button')) return;

    const widget = event.currentTarget.closest('.chat-widget');
    if (!widget) return;

    const rect = widget.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startX: event.clientX,
      startY: event.clientY,
    };
    setChatPosition({ left: rect.left, top: rect.top });
    setIsDraggingChat(true);
    fabClickPreventRef.current = false;
    event.preventDefault();
  };

  const handleFabClick = () => {
    // Prevent opening chat if the user was just dragging the FAB
    if (fabClickPreventRef.current) {
      fabClickPreventRef.current = false;
      return;
    }
    setChatOpen(!chatOpen);
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setIsThinking(true);
    let localAnswer = '';
    let provinceIntent = { type: 'none', province: '' };

    const questionType = classifyQuestion(userMsg);

    // Handle greetings
    if (questionType === 'greeting') {
      setMessages((prev) => [...prev, { role: 'ai', text: GREETING_REPLY }]);
      setIsThinking(false);
      return;
    }

    // Handle fully out of scope
    if (questionType === 'out_of_scope') {
      setMessages((prev) => [...prev, { role: 'ai', text: DATA_SCOPE_MESSAGE }]);
      setIsThinking(false);
      return;
    }

    // Handle conceptual quarry questions — send to Gemini but skip local data lookup
    // Handle conceptual quarry questions — send to Gemini, fallback gracefully
    if (questionType === 'quarry_related') {
      try {
        const res = await fetch(`${API_BASE}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMsg }),
        });
        const data = await res.json();
        const answer = data.answer || '';
        if (answer) {
          setMessages((prev) => [...prev, { role: 'ai', text: answer }]);
        } else {
          setMessages((prev) => [...prev, { role: 'ai', text: 'I understand your question is about quarry operations. Please make sure the backend is running so I can give you a detailed answer, or try asking about specific data — like "show me suspended quarries in Batangas".' }]);
        }
      } catch {
        setMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, I\'m having trouble answering that right now. Please try again in a moment.' }]);
      } finally {
        setIsThinking(false);
      }
      return;
    }

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
      // Replace local placeholder with Gemini response when available
      if (backendAnswerAllowed && backendAnswer && !backendFailed) {
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'ai') {
              next[i] = { role: 'ai', text: backendAnswer };
              break;
            }
          }
          return next;
        });
      }

      if (Array.isArray(data.rows) && data.rows.length > 0) {
        const rows = data.rows.map((d, i) => ({ ...d, id: d.id ?? `ai-${i}` }));
        const backendRowsMatchProvince = provinceIntent.type === 'none' || (provinceIntent.type === 'matched' && rows.every((row) => row.province === provinceIntent.province));
        if (backendRowsMatchProvince) {
          applyAiRows(rows, data.scope);
        }
      }
    } catch {
      if (!localAnswer) {
        setMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.' }]);
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
        <div className="lqe-stat-card"><div className="lqe-stat-label">Total Area</div><div className="lqe-stat-value">{stats.area} ha</div></div>
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
          <div className="sidebar-panel">
            <div className="sidebar-head">
              <div className="sidebar-title">
                <div className="filter-label">Filters & Overview</div>
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
                <button className={`overview-box ${overviewFilter === 'producing' ? 'active' : ''}`} type="button" onClick={() => toggleOverviewFilter('producing')} title="Show records where Status is Producing">
                  <div className="overview-label">Producing</div>
                  <div className="overview-val">{stats.producing}</div>
                </button>
                <button className={`overview-box ${overviewFilter === 'expired' ? 'active' : ''}`} type="button" onClick={() => toggleOverviewFilter('expired')} title="Show records where Date Expired is before today">
                  <div className="overview-label">Expired by Date</div>
                  <div className="overview-val">{stats.expired}</div>
                </button>
                <button className={`overview-box ${overviewFilter === 'noOperation' ? 'active' : ''}`} type="button" onClick={() => toggleOverviewFilter('noOperation')} title="Show records where Remarks is No Operation">
                  <div className="overview-label">No Operation</div>
                  <div className="overview-val">{stats.noOperation}</div>
                </button>
                <button className={`overview-box ${overviewFilter === 'suspended' ? 'active' : ''}`} type="button" onClick={() => toggleOverviewFilter('suspended')} title="Show records where Remarks is Suspended">
                  <div className="overview-label">Suspended</div>
                  <div className="overview-val">{stats.suspended}</div>
                </button>
              </div>
              {overviewFilter && (
                <Button size="small" sx={{ mt: 1 }} onClick={() => setOverviewFilter('')}>Clear overview filter</Button>
              )}
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
                <InputLabel id="year-label" shrink>Year</InputLabel>
                <Select
                  labelId="year-label"
                  value={yearFilter}
                  label="Year"
                  displayEmpty
                  onChange={(e) => {
                    setYearFilter(e.target.value);
                    setRegionFilter('');
                    setProvinceFilter('');
                    setMunicipalityFilter('');
                    if (e.target.value === '') clearAiScope();
                  }}
                  MenuProps={selectMenuProps}
                  renderValue={(value) => (
                    <span className="filter-value">
                      {value === '' ? 'All Years' : value}
                    </span>
                  )}
                >
                  <MenuItem value="">All Years</MenuItem>
                  {yearOptions.map((year) => <MenuItem key={year} value={year}>{year}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="region-label" shrink>Region</InputLabel>
                <Select
                  labelId="region-label"
                  value={regionFilter}
                  label="Region"
                  displayEmpty
                  onChange={(e) => {
                    setRegionFilter(e.target.value);
                    setProvinceFilter('');
                    setMunicipalityFilter('');
                    if (e.target.value === '') clearAiScope();
                  }}
                  MenuProps={selectMenuProps}
                  renderValue={(value) => (
                    <span className="filter-value">
                      {value === '' ? 'All Regions' : value}
                    </span>
                  )}
                >
                  <MenuItem value="">All Regions</MenuItem>
                  {regionOptions.map((region) => <MenuItem key={region} value={region}>{region}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="province-label" shrink>Province</InputLabel>
                <Select
                  labelId="province-label"
                  value={provinceFilter}
                  label="Province"
                  displayEmpty
                  onChange={(e) => {
                    setProvinceFilter(e.target.value);
                    setMunicipalityFilter('');
                    if (e.target.value === '') clearAiScope();
                  }}
                  MenuProps={selectMenuProps}
                  renderValue={(value) => (
                    <span className="filter-value">
                      {value === '' ? 'All Provinces' : value}
                    </span>
                  )}
                >
                  <MenuItem value="">All Provinces</MenuItem>
                  {provinceOptions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="municipality-label" shrink>Municipalities</InputLabel>
                <Select
                  labelId="municipality-label"
                  value={municipalityFilter}
                  label="Municipalities"
                  displayEmpty
                  onChange={(e) => {
                    setMunicipalityFilter(e.target.value);
                    if (e.target.value === '') clearAiScope();
                  }}
                  MenuProps={selectMenuProps}
                  renderValue={(value) => (
                    <span className="filter-value">
                      {value === '' ? 'All Municipalities' : value}
                    </span>
                  )}
                >
                  <MenuItem value="">All Municipalities</MenuItem>
                  {municipalityOptions.map((municipality) => (
                    <MenuItem key={municipality} value={municipality}>{municipality}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="commodity-label" shrink>Commodity</InputLabel>
                <Select
                  labelId="commodity-label"
                  value={commodityFilter}
                  label="Commodity"
                  displayEmpty
                  onChange={(e) => { setCommodityFilter(e.target.value); if (e.target.value === '') clearAiScope(); }}
                  MenuProps={selectMenuProps}
                  renderValue={(value) => (
                    <span className="filter-value">
                      {value === '' ? 'All Commodities' : value}
                    </span>
                  )}
                >
                  <MenuItem value="">All Commodities</MenuItem>
                  {commodityOptions.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              <Button variant="contained" sx={{ fontWeight: 700, padding: '10px' }} onClick={handleDownloadCSV}>
                Download CSV
              </Button>
            </div>
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

          </div>

          <div className={`workspace ${viewMode}`}>
            <div className="lqe-map-container" style={viewMode === 'split' ? { height: `${mapHeight}%` } : undefined}>
              <MapContainer
                center={phCenter}
                zoom={6}
                maxZoom={16}
                maxBounds={phBounds}
                maxBoundsViscosity={1}
                preferCanvas
                worldCopyJump={false}
                style={{
                  height: '100%',
                  width: '100%',
                  background: themeMode === 'dark' ? '#0e1018' : '#f6f7f2'
                }}
              >
                <MapResizeWatcher watch={`${viewMode}-${sidebarOpen}-${filteredData.length}-${mapHeight}-${chatLarge}`} />
                <MapBoundsLimiter />
                <MapFitToRows rows={filteredData} />
                <TileLayer url={mapTiles[themeMode]} noWrap />
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
                  {
                    field: 'region',
                    headerName: 'Region',
                    minWidth: 96,
                    flex: 0.55,
                    sortComparator: (a, b) => {
                      const parse = (v) => parseFloat(String(v)) || 0;
                      return parse(a) - parse(b);
                    },
                  },
                  { field: 'province', headerName: 'Province', minWidth: 110, flex: 0.95 },
                  { field: 'municipality', headerName: 'Municipality', minWidth: 120, flex: 0.95 },
                  { field: 'contractor', headerName: 'Company / Contractor', minWidth: 195, flex: 1.6 },
                  { field: 'commodity', headerName: 'Commodity', minWidth: 150, flex: 1.25 },
                  { field: 'status', headerName: 'Status', minWidth: 105, flex: 0.8 },
                  { field: 'riskScore', headerName: 'Risk', minWidth: 62, flex: 0.45 },
                  { field: 'area_hectares', headerName: 'Area (ha)', minWidth: 78, flex: 0.6 },
                  { field: 'year', headerName: 'Year', minWidth: 62, flex: 0.45 },
                  { field: 'date_approved', headerName: 'Approved', minWidth: 92, flex: 0.7 },
                  { field: 'date_expired', headerName: 'Date Expired', minWidth: 112, flex: 0.85 },
                  { field: 'remarks', headerName: 'Remarks', minWidth: 150, flex: 1.1 },
                ]}
                columnHeaderHeight={38}
                rowHeight={34}
                density="compact"
                disableRowSelectionOnClick
                getRowId={(row) => row.id}
                pageSizeOptions={[25, 50, 100, { value: -1, label: 'All' }]}
                initialState={{
                  sorting: {
                    sortModel: [{ field: 'region', sort: 'asc' }],
                  },
                  pagination: {
                    paginationModel: { pageSize: 25, page: 0 },
                  },
                }}
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
            Quarry Land AI turns quarry permit records into a practical decision-support tool. The goal is to help students,
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
          <div className="lqe-logo">QuarryMap PH</div>
          <div className="lqe-actions">
            <Tooltip title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton color="primary" onClick={() => setThemeMode((value) => (value === 'dark' ? 'light' : 'dark'))} aria-label="Toggle color mode">
                {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Button variant="outlined" size="small" onClick={() => setOpenSources(true)}>Sources</Button>
          </div>
        </header>

        {page === 'explorer' ? renderExplorer() : renderProjectPage()}

        <div
          className={`chat-widget ${chatOpen ? 'open' : ''} ${shouldOpenChatRight ? 'open-right' : 'open-left'}`}
          style={chatPosition ? { left: chatPosition.left, top: chatPosition.top, bottom: 'auto', right: 'auto', position: 'fixed' } : undefined}
        >
          {chatOpen && (
            <div
              className={`chat-window ${chatLarge ? 'large' : ''} ${isDraggingChat ? 'dragging' : ''}`}
            >
              <div className="chat-header" onPointerDown={startChatDrag}>
                <div className="chat-title">
                  <span className="chat-title-icon"><ChatBubbleOutlinedIcon fontSize="small" /></span>
                  <span className="chat-title-text">
                    <span>Quarry Land Assistant</span>
                    <span className="chat-title-sub">Ask about permits, locations, and risk</span>
                  </span>
                </div>
                <div className="chat-tools">
                  <Tooltip title={chatLarge ? 'Compact chat' : 'Expand chat'}>
                    <IconButton size="small" color="primary" onClick={() => setChatLarge((value) => !value)} aria-label={chatLarge ? 'Compact chat' : 'Expand chat'}>
                      {chatLarge ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Close chat">
                    <IconButton size="small" color="primary" onClick={() => setChatOpen(false)} aria-label="Close chat">
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              <div className="chat-messages" ref={messagesRef} onPointerDown={startChatDrag}>
                {messages.map((m, i) => (
                  <div key={`${m.role}-${i}`} className={`msg ${m.role}`}>
                    {renderMessageText(m.text)}
                    {m.role === 'ai' && i === 0 && (
                      <div className="sample-questions">
                        {SAMPLE_QUESTIONS.map((q) => (
                          <button key={q} className="sample-q" onClick={() => { setInput(q); }}>
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isThinking && (
                  <div className="msg ai thinking">
                    <span>Thinking</span>
                    <span className="thinking-dots">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </span>
                  </div>
                )}
              </div>
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask about quarry land..."
                />
                <Tooltip title="Send message">
                  <span>
                    <IconButton className="chat-send-button" onClick={handleSend} disabled={!input.trim() || isThinking} aria-label="Send message">
                      <SendIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            </div>
          )}

          {!chatOpen && (
            <button className="chat-fab" onPointerDown={startChatDrag} onClick={handleFabClick}>
              <ChatBubbleOutlinedIcon fontSize="small" />
              <span>Ask About Quarry Land</span>
            </button>
          )}
        </div>
      </div>

      <Dialog
        open={openSources}
        onClose={() => setOpenSources(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          style: {
            background: themeMode === 'dark' ? '#13161f' : '#ffffff',
            color: themeMode === 'dark' ? '#e8e2d4' : '#182018',
            border: themeMode === 'dark' ? '1px solid #2a2d3a' : '1px solid #d8ded3',
            borderRadius: '12px',
          }
        }}
      >
        <DialogTitle style={{
          fontFamily: "'Google Sans Display', sans-serif",
          fontSize: '1.1rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          borderBottom: themeMode === 'dark' ? '1px solid #2a2d3a' : '1px solid #d8ded3',
          paddingBottom: '1rem',
          color: themeMode === 'dark' ? '#e8e2d4' : '#182018',
        }}>
          Sources &amp; Transparency
        </DialogTitle>

        <DialogContent style={{ padding: '1.5rem 1.75rem' }}>
          <div style={{ fontFamily: "'Google Sans', system-ui, sans-serif", fontSize: '0.92rem', lineHeight: 1.7, color: themeMode === 'dark' ? '#8d91a3' : '#66705f' }}>

            <p style={{ marginBottom: '1rem', color: themeMode === 'dark' ? '#e8e2d4' : '#182018' }}>
              The data used in this system is sourced from the official records of the:
            </p>

            <a
              href="https://www.mgb.gov.ph"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: '0.88rem',
                letterSpacing: '0.06em',
                marginBottom: '1.5rem',
                color: themeMode === 'dark' ? '#d4a855' : '#2f7d58',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                cursor: 'pointer',
              }}
            >
              MINES AND GEOSCIENCES BUREAU (MGB)<br />
              DIRECTORY OF OPERATING MINES AND QUARRIES ↗
            </a>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: themeMode === 'dark' ? '1px solid #2a2d3a' : '1px solid #d8ded3', paddingTop: '1.25rem' }}>

              <div>
                <span style={{ fontWeight: 700, color: themeMode === 'dark' ? '#e8e2d4' : '#182018' }}>Official Origin — </span>
                All information is derived from the public administrative records maintained by the Mines and Geosciences Bureau (MGB).
              </div>

              <div>
                <span style={{ fontWeight: 700, color: themeMode === 'dark' ? '#e8e2d4' : '#182018' }}>Data Content — </span>
                The dataset includes registered permit holders, specific commodity types (such as Sand and Gravel or Limestone), and official operational statuses.
              </div>

              <div>
                <span style={{ fontWeight: 700, color: themeMode === 'dark' ? '#e8e2d4' : '#182018' }}>Accuracy Statement — </span>
                To ensure the system reflects current conditions, all records are based on the most recent government disclosures and mineral industry directories available.
              </div>

            </div>
          </div>
        </DialogContent>

        <DialogActions style={{
          padding: '1rem 1.75rem',
          borderTop: themeMode === 'dark' ? '1px solid #2a2d3a' : '1px solid #d8ded3',
        }}>
          <Button
            onClick={() => setOpenSources(false)}
            variant="contained"
            size="small"
            style={{
              background: themeMode === 'dark' ? '#d4a855' : '#2f7d58',
              color: '#fff',
              fontFamily: "'Google Sans', sans-serif",
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '6px',
              padding: '6px 20px',
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
