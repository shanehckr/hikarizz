import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DataGrid } from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip } from '@mui/material';

const calculateRiskScore = (q) => {
  let score = 0;

  // Example logic (you can improve later)
  if (q.area_hectares) {
    score += Math.min(30, q.area_hectares / 2);
  }

  if (q.material?.toLowerCase().includes('sand')) score += 20;
  if (q.material?.toLowerCase().includes('gravel')) score += 15;

  if (q.status === 'Expired') score += 30;
  if (q.status === 'Pending') score += 10;

  return Math.min(100, Math.round(score));
};

const getRiskColor = (score) => {
  if (score >= 70) return '#ef4444';   // 🔴 High
  if (score >= 40) return '#f59e0b';   // 🟡 Medium
  return '#22c55e';                    // 🟢 Low
};

/* ─── Google Fonts ───────────────────────────────────────────────────── */
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap';
document.head.appendChild(fontLink);

/* ─── MUI dark theme ─────────────────────────────────────────────────── */
const muiTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#d4a855' }, background: { paper: '#1a1d26', default: '#0e1018' } },
  typography: { fontFamily: 'DM Mono, monospace' },
});

/* ─── CSS-in-JS styles injected once ─────────────────────────────────── */
const styleTag = document.createElement('style');
styleTag.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body, html { height: 100%; background: #0e1018; }

  .lqe-root {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #0e1018;
    color: #e8e2d4;
    font-family: 'DM Mono', monospace;
  }

  /* ── Header ── */
  .lqe-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 32px;
    background: #13161f;
    border-bottom: 1px solid #2a2d3a;
    position: sticky;
    top: 0;
    z-index: 200;
  }
  .lqe-logo-group { display: flex; align-items: baseline; gap: 12px; }
  .lqe-logo-text {
    font-family: 'Syne', sans-serif;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f0e8d5;
  }
  .lqe-logo-badge {
    font-size: 0.65rem;
    background: #d4a855;
    color: #0e1018;
    padding: 2px 8px;
    border-radius: 2px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .lqe-header-actions { display: flex; gap: 10px; align-items: center; }

  /* ── Stats bar ── */
  .lqe-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: #2a2d3a;
    border-bottom: 1px solid #2a2d3a;
  }
  .lqe-stat-card {
    background: #13161f;
    padding: 20px 28px;
    transition: background 0.2s;
  }
  .lqe-stat-card:hover { background: #1a1d27; }
  .lqe-stat-label {
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b6d7e;
    margin-bottom: 6px;
  }
  .lqe-stat-value {
    font-family: 'Syne', sans-serif;
    font-size: 2rem;
    font-weight: 700;
    color: #d4a855;
    line-height: 1;
  }
  .lqe-stat-sub {
    font-size: 0.7rem;
    color: #4e5060;
    margin-top: 4px;
  }

  /* ── Body ── */
  .lqe-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* ── Sidebar ── */
  .lqe-sidebar {
    width: 240px;
    flex-shrink: 0;
    background: #13161f;
    border-right: 1px solid #2a2d3a;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }
  .lqe-sidebar-heading {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b6d7e;
    padding-bottom: 10px;
    border-bottom: 1px solid #2a2d3a;
  }
  .lqe-filter-group { display: flex; flex-direction: column; gap: 6px; }
  .lqe-filter-label {
    font-size: 0.65rem;
    color: #8b8ea0;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .lqe-select {
    background: #0e1018;
    border: 1px solid #2a2d3a;
    color: #e8e2d4;
    padding: 9px 12px;
    border-radius: 4px;
    font-family: 'DM Mono', monospace;
    font-size: 0.78rem;
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23d4a855' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }
  .lqe-select:focus { border-color: #d4a855; box-shadow: 0 0 0 2px rgba(212,168,85,0.12); }

  .lqe-active-filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .lqe-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.65rem;
    background: rgba(212,168,85,0.12);
    color: #d4a855;
    border: 1px solid rgba(212,168,85,0.25);
    border-radius: 2px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .lqe-chip:hover { background: rgba(212,168,85,0.22); }
  .lqe-chip-x { opacity: 0.7; font-size: 0.75rem; }

  .lqe-sidebar-export {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lqe-btn {
    font-family: 'DM Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 10px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: all 0.18s;
    font-weight: 500;
  }
  .lqe-btn-primary {
    background: #d4a855;
    color: #0e1018;
  }
  .lqe-btn-primary:hover { background: #e0b96a; transform: translateY(-1px); }
  .lqe-btn-ghost {
    background: transparent;
    color: #8b8ea0;
    border: 1px solid #2a2d3a;
  }
  .lqe-btn-ghost:hover { border-color: #d4a855; color: #d4a855; }

  /* ── Main area ── */
  .lqe-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* ── Map ── */
  .lqe-map-wrap {
    height: 45vh;
    min-height: 280px;
    position: relative;
    border-bottom: 1px solid #2a2d3a;
  }
  .lqe-map-wrap .leaflet-container {
    background: #1a1d26 !important;
  }
  .lqe-map-label {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 999;
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: rgba(14,16,24,0.85);
    color: #d4a855;
    padding: 5px 10px;
    border: 1px solid rgba(212,168,85,0.2);
    border-radius: 2px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .lqe-map-count {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 999;
    font-size: 0.68rem;
    background: rgba(14,16,24,0.85);
    color: #8b8ea0;
    padding: 5px 10px;
    border: 1px solid #2a2d3a;
    border-radius: 2px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }

  /* ── Table ── */
  .lqe-table-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .lqe-table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-bottom: 1px solid #2a2d3a;
    background: #13161f;
  }
  .lqe-table-title {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b6d7e;
  }
  .lqe-table-count {
    font-size: 0.72rem;
    color: #d4a855;
  }

  /* ── Dialog ── */
  .lqe-dialog-body { line-height: 1.7; color: #b0b3c6; font-size: 0.82rem; }
  .lqe-dialog-body strong { color: #d4a855; }
  .lqe-dialog-section { margin-bottom: 14px; }
  .lqe-dialog-divider { border: none; border-top: 1px solid #2a2d3a; margin: 16px 0; }

  /* ── Tooltip override ── */
  .leaflet-tooltip {
    background: #1a1d26 !important;
    border: 1px solid #d4a855 !important;
    color: #e8e2d4 !important;
    font-family: 'DM Mono', monospace !important;
    font-size: 0.72rem !important;
    border-radius: 3px !important;
    padding: 6px 10px !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
  }
  .leaflet-tooltip-left::before,
  .leaflet-tooltip-right::before,
  .leaflet-tooltip-top::before,
  .leaflet-tooltip-bottom::before {
    border-right-color: #d4a855 !important;
    border-left-color: #d4a855 !important;
    border-top-color: #d4a855 !important;
    border-bottom-color: #d4a855 !important;
  }

  /* ── MUI DataGrid overrides ── */
  .MuiDataGrid-root {
    border: none !important;
    font-family: 'DM Mono', monospace !important;
    font-size: 0.75rem !important;
  }
  .MuiDataGrid-columnHeader {
    background: #0e1018 !important;
    color: #6b6d7e !important;
    font-size: 0.62rem !important;
    letter-spacing: 0.1em !important;
    text-transform: uppercase !important;
  }
  .MuiDataGrid-columnSeparator { display: none !important; }
  .MuiDataGrid-row { transition: background 0.15s !important; }
  .MuiDataGrid-row:hover { background: rgba(212,168,85,0.05) !important; }
  .MuiDataGrid-cell { border-bottom-color: #1e2030 !important; }
  .MuiDataGrid-footerContainer { border-top-color: #2a2d3a !important; background: #0e1018 !important; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .lqe-stats .lqe-stat-card {
    animation: fadeIn 0.4s ease both;
  }
  .lqe-stats .lqe-stat-card:nth-child(1) { animation-delay: 0.05s; }
  .lqe-stats .lqe-stat-card:nth-child(2) { animation-delay: 0.10s; }
  .lqe-stats .lqe-stat-card:nth-child(3) { animation-delay: 0.15s; }
  .lqe-stats .lqe-stat-card:nth-child(4) { animation-delay: 0.20s; }
`;
document.head.appendChild(styleTag);

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmtNum = n => n?.toLocaleString() ?? '—';
const totalHa = arr => arr.reduce((s, r) => s + (parseFloat(r.area_hectares) || 0), 0).toFixed(1);

/* ─── Status pill ─────────────────────────────────────────────────────── */
const STATUS_COLORS = {
  Active: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80', border: 'rgba(74,222,128,0.25)' },
  Expired: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.25)' },
  Pending: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
};
function StatusPill({ value }) {
  const s = STATUS_COLORS[value] || { bg: 'rgba(255,255,255,0.05)', color: '#8b8ea0', border: '#2a2d3a' };
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.65rem', padding: '2px 8px',
      borderRadius: '2px', background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, letterSpacing: '0.06em', textTransform: 'uppercase'
    }}>{value || '—'}</span>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
export default function LandQuarryExplorer() {
  const [allData, setAllData] = useState([]);
  const [provinceFilter, setProvinceFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/quarries')
      .then(r => r.json())
      .then(data => {
        const withRisk = data.map(q => ({
          ...q,
          riskScore: calculateRiskScore(q)
        }));
        setAllData(withRisk);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredData = useMemo(() => {
    let r = allData;
    if (provinceFilter) r = r.filter(d => d.province === provinceFilter);
    if (materialFilter) r = r.filter(d => d.material === materialFilter);
    return r;
  }, [allData, provinceFilter, materialFilter]);

  const uniqueProvinces = useMemo(() => [...new Set(allData.map(d => d.province))].filter(Boolean).sort(), [allData]);
  const uniqueMaterials = useMemo(() => {
    const base = provinceFilter ? allData.filter(d => d.province === provinceFilter) : allData;
    return [...new Set(base.map(d => d.material))].filter(Boolean).sort();
  }, [allData, provinceFilter]);

  const mappable = filteredData.filter(d => d.latitude && d.longitude);

  const exportToCSV = () => {
    if (!filteredData.length) return;
    const headers = Object.keys(filteredData[0]).join(',');
    const rows = filteredData.map(o => Object.values(o).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'quarry_export.csv' }).click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { field: 'contractor', headerName: 'Company / Contractor', flex: 2, minWidth: 220 },
    { field: 'province', headerName: 'Province', flex: 1, minWidth: 120 },
    { field: 'municipality', headerName: 'Municipality', flex: 1, minWidth: 120 },
    { field: 'barangay', headerName: 'Barangay', flex: 1, minWidth: 120 },
    { field: 'material', headerName: 'Material', flex: 1, minWidth: 150 },
    {
      field: 'status', headerName: 'Status', flex: 0.8, minWidth: 100,
      renderCell: ({ value }) => <StatusPill value={value} />
    },
    {
      field: 'area_hectares', headerName: 'Area (Ha)', flex: 0.7, minWidth: 100, type: 'number',
      renderCell: ({ value }) => (
        <span style={{ color: '#d4a855', fontVariantNumeric: 'tabular-nums' }}>
          {value ? Number(value).toLocaleString() : '—'}
        </span>
      )
    },
    { field: 'date_approved', headerName: 'Approved', flex: 0.9, minWidth: 110 },
  ];

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="lqe-root">

        {/* ── Header ── */}
        <header className="lqe-header">
          <div className="lqe-logo-group">
            <span className="lqe-logo-text">Land Quarry Explorer</span>
            <span className="lqe-logo-badge">PH · 2025</span>
          </div>
          <div className="lqe-header-actions">
            <button className="lqe-btn lqe-btn-ghost" onClick={() => setIsModalOpen(true)}>
              Sources & Transparency
            </button>
          </div>
        </header>

        {/* ── Stats bar ── */}
        <div className="lqe-stats">
          {[
            { label: 'Total Permits', value: fmtNum(filteredData.length), sub: `of ${fmtNum(allData.length)} total` },
            { label: 'Provinces', value: fmtNum([...new Set(filteredData.map(d => d.province))].filter(Boolean).length), sub: 'covered' },
            { label: 'Materials', value: fmtNum([...new Set(filteredData.map(d => d.material))].filter(Boolean).length), sub: 'types' },
            { label: 'Total Area', value: fmtNum(Math.round(parseFloat(totalHa(filteredData)))), sub: 'hectares permitted' },
          ].map(({ label, value, sub }) => (
            <div className="lqe-stat-card" key={label}>
              <div className="lqe-stat-label">{label}</div>
              <div className="lqe-stat-value">{value}</div>
              <div className="lqe-stat-sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="lqe-body">

          {/* ── Sidebar ── */}
          <aside className="lqe-sidebar">
            <div className="lqe-sidebar-heading">Filter Data</div>

            <div className="lqe-filter-group">
              <label className="lqe-filter-label">Province</label>
              <select
                className="lqe-select"
                value={provinceFilter}
                onChange={e => { setProvinceFilter(e.target.value); setMaterialFilter(''); }}
              >
                <option value="">All Provinces</option>
                {uniqueProvinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="lqe-filter-group">
              <label className="lqe-filter-label">Material</label>
              <select
                className="lqe-select"
                value={materialFilter}
                onChange={e => setMaterialFilter(e.target.value)}
              >
                <option value="">All Materials</option>
                {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Active filter chips */}
            {(provinceFilter || materialFilter) && (
              <div>
                <div className="lqe-filter-label" style={{ marginBottom: 8 }}>Active</div>
                <div className="lqe-active-filters">
                  {provinceFilter && (
                    <span className="lqe-chip" onClick={() => { setProvinceFilter(''); setMaterialFilter(''); }}>
                      {provinceFilter} <span className="lqe-chip-x">✕</span>
                    </span>
                  )}
                  {materialFilter && (
                    <span className="lqe-chip" onClick={() => setMaterialFilter('')}>
                      {materialFilter} <span className="lqe-chip-x">✕</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="lqe-sidebar-export">
              <div className="lqe-filter-label" style={{ marginBottom: 4 }}>Export</div>
              <button className="lqe-btn lqe-btn-primary" onClick={exportToCSV}>
                ↓ Download CSV
              </button>
              <div style={{ fontSize: '0.62rem', color: '#4e5060', textAlign: 'center' }}>
                {fmtNum(filteredData.length)} records
              </div>
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="lqe-main">

            {/* ── Map ── */}
            <div className="lqe-map-wrap">
              <div className="lqe-map-label">◉ Live Map View</div>
              <div className="lqe-map-count">
                {fmtNum(mappable.length)} geocoded permits
              </div>
              <MapContainer center={[14.1, 121.0]} zoom={8} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                />
                {mappable.map((quarry, i) => (
                  <CircleMarker
                    key={i}
                    center={[quarry.latitude, quarry.longitude]}
                    radius={6}
                    pathOptions={{
                      color: getRiskColor(quarry.riskScore),
                      fillColor: getRiskColor(quarry.riskScore),
                      fillOpacity: 0.7,
                      weight: 1.5
                    }}
                  >
                    <Tooltip>
                      <div style={{ lineHeight: 1.6 }}>
                        <div style={{ color: '#d4a855', fontWeight: 500 }}>
                          {quarry.contractor}
                        </div>

                        <div>{quarry.material} · {quarry.province}</div>

                        <div style={{ color: getRiskColor(quarry.riskScore) }}>
                          Risk: {quarry.riskScore}/100
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {/* ── Table ── */}
            <div className="lqe-table-wrap">
              <div className="lqe-table-header">
                <span className="lqe-table-title">Permit Registry</span>
                <span className="lqe-table-count">{fmtNum(filteredData.length)} records</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                  rows={filteredData}
                  columns={columns}
                  getRowId={row => row.id ?? row.contractor + Math.random()}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  loading={loading}
                  sx={{
                    height: '100%',
                    '& .MuiDataGrid-virtualScroller': { background: '#0e1018' },
                    '& .MuiDataGrid-overlayWrapper': { background: '#0e1018' },
                  }}
                  disableRowSelectionOnClick
                />
              </div>
            </div>

          </main>
        </div>

        {/* ── Modal ── */}
        <Dialog
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          PaperProps={{
            style: { background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 6, maxWidth: 480 }
          }}
        >
          <DialogTitle style={{ fontFamily: 'Syne, sans-serif', color: '#f0e8d5', fontSize: '1.05rem', fontWeight: 700 }}>
            Transparency & Sources
          </DialogTitle>
          <DialogContent className="lqe-dialog-body">
            <div className="lqe-dialog-section">
              <strong>Built by Team Hikarizz</strong> — a civic technology initiative to
              democratize access to public governance data in the Philippines.
            </div>
            <hr className="lqe-dialog-divider" />
            <div className="lqe-dialog-section">
              <strong>Data Source</strong><br />
              All records are sourced from the official{' '}
              <strong>Mines and Geosciences Bureau (MGB)</strong> public directory.
              Dataset: <em>Directory of Operating Mines and Quarries CY-2025</em>.
            </div>
            <div className="lqe-dialog-section">
              <strong>Disclaimer</strong><br />
              This tool is for informational purposes only. Data accuracy depends on MGB's
              official records. Always verify critical information with the issuing agency.
            </div>
          </DialogContent>
          <DialogActions style={{ padding: '12px 20px', borderTop: '1px solid #2a2d3a' }}>
            <button className="lqe-btn lqe-btn-primary" onClick={() => setIsModalOpen(false)}>
              Close
            </button>
          </DialogActions>
        </Dialog>

      </div>
    </ThemeProvider>
  );
}
