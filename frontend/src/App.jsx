import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import 'leaflet/dist/leaflet.css';
import { DataGrid } from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

/* ─── Philippines Center ─── */
const phCenter = [12.8797, 121.7740];

const getRiskColor = (score) => {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f59e0b';
  return '#22c55e';
};

/* ─── Theme & Typography ─── */
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Google+Sans+Display:wght@400;700&display=swap';
document.head.appendChild(fontLink);

const muiTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#d4a855' }, background: { paper: '#1a1d26', default: '#0e1018' } },
  typography: { fontFamily: "'Google Sans', sans-serif" },
});

/* ─── Robust Full-View Styles with Upward Dropdowns ─── */
const styleTag = document.createElement('style');
styleTag.textContent = `

  .thinking { font-style: italic; color: #6b6d7e; display: flex; gap: 4px; align-items: center; }
  .dot { 
    animation: blink 1.4s infinite both; 
    font-size: 1.5rem; 
    line-height: 0; 
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes blink {
    0% { opacity: 0.2; }
    20% { opacity: 1; }
    100% { opacity: 0.2; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100vh; width: 100vw; overflow: hidden; background: #0e1018; color: #e8e2d4; font-family: 'Google Sans', sans-serif; }
  
  .lqe-root { display: flex; flex-direction: column; height: 100vh; width: 100vw; }

  .lqe-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 60px; background: #13161f; border-bottom: 1px solid #2a2d3a; }
  .lqe-logo { font-family: 'Google Sans Display', sans-serif; font-size: 1.3rem; font-weight: 700; color: #f0e8d5; }
  
  .lqe-stats { flex-shrink: 0; display: grid; grid-template-columns: repeat(4, 1fr); background: #13161f; border-bottom: 1px solid #2a2d3a; }
  .lqe-stat-card { padding: 12px 24px; border-right: 1px solid #2a2d3a; }
  .lqe-stat-label { font-size: 0.6rem; color: #6b6d7e; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .lqe-stat-value { font-family: 'Google Sans Display', sans-serif; font-size: 1.6rem; font-weight: 700; color: #d4a855; }

  .lqe-body { flex: 1; display: flex; min-height: 0; }

  /* Sidebar */
  .lqe-sidebar { 
    width: 300px; 
    flex-shrink: 0; 
    background: #13161f; 
    border-right: 1px solid #2a2d3a; 
    padding: 20px; 
    display: flex; 
    flex-direction: column; 
    gap: 20px; 
    overflow-y: auto; 
  }
  
  .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .overview-box { background: #0e1018; border: 1px solid #2a2d3a; border-radius: 8px; padding: 14px 8px; text-align: center; }
  .overview-label { font-size: 0.55rem; color: #6b6d7e; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .overview-val { font-family: 'Google Sans Display', sans-serif; font-size: 1.4rem; font-weight: 700; }

  .filter-group {position: relative; display: flex; flex-direction: column; gap: 6px; }
  .filter-label { font-size: 0.65rem; color: #6b6d7e; font-weight: 700; text-transform: uppercase; }

  /* Upward Menu Strategy: Uses a container that expands upward */
.lqe-select { 
  width: 100%; 
  background: #0e1018; 
  border: 1px solid #2a2d3a; 
  color: #e8e2d4; 
  padding: 10px; 
  border-radius: 6px; 
  font-family: inherit;
  cursor: pointer;
  appearance: none;
  /* Change the arrow icon to point UP to indicate upward behavior */
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6d7e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='18 15 12 9 6 15'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 1em;
}

.sidebar-filters-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-top: 20px;
  border-top: 1px solid #2a2d3a;
}

  /* Main Viewport */
 .lqe-main { 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    min-width: 800px; /* Forces the table to expand horizontally */
  }
  .lqe-map-container { height: 42%; flex-shrink: 0; border-bottom: 1px solid #2a2d3a; position: relative; z-index: 1; }
  .lqe-table-container { flex: 1; min-height: 0; padding: 12px; background: #0e1018; }

  /* AI Floating UI */
  .chat-fab { 
    position: fixed; 
    bottom: 25px; 
    right: 25px; 
    z-index: 1000; 
    padding: 0 20px; 
    height: 50px; 
    border-radius: 25px; 
    background: #d4a855; 
    border: none; 
    cursor: pointer; 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    box-shadow: 0 4px 20px rgba(0,0,0,0.4); 
    transition: transform 0.2s ease;
  }
  .chat-fab:hover { transform: scale(1.05); }
  .chat-fab-text { 
    color: #0e1018; 
    font-weight: 700; 
    font-size: 0.85rem; 
    text-transform: uppercase; 
    letter-spacing: 0.05em; 
  }
  .chat-fab-icon { font-size: 20px; }
  .chat-window { 
    position: fixed; 
    bottom: 85px; 
    right: 25px; 
    z-index: 1001; 
    width: 320px; 
    height: 320px; /* Reduced from 400px to 320px */
    background: #13161f; 
    border: 1px solid #2a2d3a; 
    border-radius: 12px; 
    display: flex; 
    flex-direction: column; 
    box-shadow: 0 10px 40px rgba(0,0,0,0.6); 
    overflow: hidden; 
  }
  .chat-header { padding: 16px; background: #1a1d26; font-weight: 700; font-size: 0.9rem; border-bottom: 1px solid #2a2d3a; }
  .chat-messages { 
    flex: 1; 
    overflow-y: auto; 
    padding: 16px; 
    display: flex; 
    flex-direction: column; 
    gap: 12px; 
    background: #0e1018; /* Darker background for contrast */
  }

  .msg { 
    width: fit-content;
    max-width: 85%; 
    padding: 10px 14px; 
    font-size: 0.85rem; 
    line-height: 1.5; 
    word-wrap: break-word;
    text-align: left; /* FIX: Forces natural text reading flow */
  }

  .msg.ai { 
    align-self: flex-start; 
    background: #1a1d26; 
    border: 1px solid #2a2d3a; 
    color: #e8e2d4;
    border-radius: 14px 14px 14px 2px; /* Rounded except bottom-left */
  }

  .msg.user { 
    align-self: flex-end; 
    background: #d4a855; 
    color: #0e1018; 
    font-weight: 500; 
    border-radius: 14px 14px 2px 14px; /* Rounded except bottom-right */
    text-align: left; /* Keep text left-aligned inside the bubble for readability */
  }
 .MuiDataGrid-root { 
    width: 100% !important; 
    border: none !important; 
  }
`;
document.head.appendChild(styleTag);

export default function App() {
  const [isThinking, setIsThinking] = useState(false);
  const [allData, setAllData] = useState([]);
  const [provinceFilter, setProvinceFilter] = useState('');
  const [commodityFilter, setCommodityFilter] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'ai', text: 'Ask me anything about quarry permits or local risk scores.' }]);
  const [input, setInput] = useState('');
  const [openSources, setOpenSources] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/api/quarries')
      .then(r => r.json())
      .then(data => setAllData(data.map((d, i) => ({ ...d, id: d.id ?? i }))))
      .catch(console.error);
  }, []);

  const filteredData = useMemo(() => {
    return allData.filter(d => (!provinceFilter || d.province === provinceFilter) && (!commodityFilter || d.commodity === commodityFilter));
  }, [allData, provinceFilter, commodityFilter]);

  const stats = useMemo(() => {
    const areaSum = filteredData.reduce((acc, d) => acc + (parseFloat(d.area_hectares) || 0), 0);
    return {
      permits: filteredData.length,
      provinces: [...new Set(filteredData.map(d => d.province))].length,
      commodities: [...new Set(filteredData.map(d => d.commodity))].length,
      area: areaSum.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      validated: filteredData.filter(d => (d.riskScore || 0) > 0).length,
      highRisk: filteredData.filter(d => (d.riskScore || 0) >= 70).length,
      expired: filteredData.filter(d => (d.status || '').toLowerCase().includes('expired')).length,
      producing: filteredData.filter(d => (d.status || '').toLowerCase().includes('producing')).length
    };
  }, [filteredData]);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return; // Prevent double-sending
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    setIsThinking(true); // Start thinking
    try {
      const res = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Hikarizz AI connection lost.' }]);
    } finally {
      setIsThinking(false); // Stop thinking regardless of success/fail
    }
  };

  const handleDownloadCSV = () => {
    if (!filteredData.length) return;

    const headers = Object.keys(filteredData[0]);

    const csvRows = [
      headers.join(','), // header row
      ...filteredData.map(row =>
        headers.map(field => `"${row[field] ?? ''}"`).join(',')
      )
    ];

    const csvString = csvRows.join('\n');

    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'quarry_data.csv';
    link.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="lqe-root">
        <header className="lqe-header">
          <div className="lqe-logo">Land Quarry Explorer <span style={{ fontSize: '0.6rem', background: '#d4a855', color: '#0e1018', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>HIKARIZZ · 2026</span></div>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setOpenSources(true)}
          >
            Sources & Transparency
          </Button>
        </header>

        <section className="lqe-stats">
          <div className="lqe-stat-card"><div className="lqe-stat-label">Total Permits</div><div className="lqe-stat-value">{stats.permits}</div></div>
          <div className="lqe-stat-card"><div className="lqe-stat-label">Provinces</div><div className="lqe-stat-value">{stats.provinces}</div></div>
          <div className="lqe-stat-card"><div className="lqe-stat-label">Commodities</div><div className="lqe-stat-value">{stats.commodities}</div></div>
          <div className="lqe-stat-card"><div className="lqe-stat-label">Total Area</div><div className="lqe-stat-value">{stats.area}</div></div>
        </section>

        <div className="lqe-body">
          <aside className="lqe-sidebar">
            <div className="filter-label" style={{ marginBottom: '4px' }}>Overview</div>
            <div className="overview-grid">
              <div className="overview-box"><div className="overview-label">Validated</div><div className="overview-val" style={{ color: '#d4a855' }}>{stats.validated}</div></div>
              <div className="overview-box"><div className="overview-label">High Risk</div><div className="overview-val" style={{ color: '#ef4444' }}>{stats.highRisk}</div></div>
              <div className="overview-box"><div className="overview-label">Expired</div><div className="overview-val" style={{ color: '#f59e0b' }}>{stats.expired}</div></div>
              <div className="overview-box"><div className="overview-label">Producing</div><div className="overview-val" style={{ color: '#22c55e' }}>{stats.producing}</div></div>
            </div>

            {/* Removed marginTop: 'auto' here to keep elements grouped at the top */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="filter-group">
                <label className="filter-label">Province</label>
                <select className="lqe-select" value={provinceFilter} onChange={e => setProvinceFilter(e.target.value)}>
                  <option value="">All Provinces</option>
                  {[...new Set(allData.map(d => d.province))].filter(Boolean).sort().map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Commodity</label>
                <select className="lqe-select" value={commodityFilter} onChange={e => setCommodityFilter(e.target.value)}>
                  <option value="">All Commodities</option>
                  {[...new Set(allData.map(d => d.commodity))].filter(Boolean).sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <Button
                variant="contained"
                sx={{ fontWeight: 700, padding: '10px', mt: 1 }}
                onClick={handleDownloadCSV}
              >
                Download CSV
              </Button>
            </div>
          </aside>

          <main className="lqe-main">
            <div className="lqe-map-container">
              <MapContainer center={phCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                {filteredData.filter(d => d.latitude).map(d => (
                  <CircleMarker key={d.id} center={[d.latitude, d.longitude]} radius={6} pathOptions={{ color: getRiskColor(d.riskScore), fillColor: getRiskColor(d.riskScore), fillOpacity: 0.7 }}>
                    <Tooltip><b>{d.contractor}</b><br />{d.province} · {d.commodity}</Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
            <div className="lqe-table-container">
              <DataGrid
                rows={filteredData}
                columns={[
                  { field: 'contractor', headerName: 'Company / Contractor', minWidth: 250, flex: 2 },
                  { field: 'province', headerName: 'Province', minWidth: 150, flex: 1 },
                  { field: 'municipality', headerName: 'Municipality', minWidth: 150, flex: 1 },
                  { field: 'commodity', headerName: 'Commodity', minWidth: 220, flex: 2 },
                  { field: 'status', headerName: 'Status', minWidth: 200, flex: 2 },
                  { field: 'area_hectares', headerName: 'Area (Ha)', minWidth: 100, flex: 0.8 },
                  { field: 'date_approved', headerName: 'Approved', minWidth: 130, flex: 1 }
                ]}
                rowHeight={52}
                density="standard"
                disableRowSelectionOnClick
              />
            </div>
          </main>
        </div>

        <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)}>
          <span className="chat-fab-icon">{chatOpen ? '✕' : '✨'}</span>
          {!chatOpen && <span className="chat-fab-text">Ask Hikarizz AI</span>}
        </button>
        {chatOpen && (
          <div className="chat-window">
            <div className="chat-header">Hikarizz AI Assistant</div>
            <div className="chat-messages">
              {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}

              {isThinking && (
                <div className="msg ai thinking">
                  <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                </div>
              )}
            </div>
            <div style={{ padding: '12px', display: 'flex', gap: '8px', borderTop: '1px solid #2a2d3a', background: '#13161f' }}>
              <input style={{ flex: 1, background: '#0e1018', border: '1px solid #2a2d3a', color: '#fff', padding: '8px', borderRadius: '4px' }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Message AI..." />
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