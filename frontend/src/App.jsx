import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DataGrid } from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip } from '@mui/material';

/* ─── Philippines Bounding Box ─── */
const phBounds = [
  [4.5, 116.0], // Southwest
  [21.5, 127.0] // Northeast
];

const calculateRiskScore = (q) => {
  let score = 0;
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

/* ─── Google Fonts ─── */
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap';
document.head.appendChild(fontLink);

/* ─── MUI dark theme ─── */
const muiTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#d4a855' }, background: { paper: '#1a1d26', default: '#0e1018' } },
  typography: { fontFamily: 'DM Mono, monospace' },
});

/* ─── CSS-in-JS styles ─── */
const styleTag = document.createElement('style');
styleTag.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { height: 100%; background: #0e1018; }
  .lqe-root { display: flex; flex-direction: column; min-height: 100vh; background: #0e1018; color: #e8e2d4; font-family: 'DM Mono', monospace; }
  .lqe-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 32px; background: #13161f; border-bottom: 1px solid #2a2d3a; position: sticky; top: 0; z-index: 200; }
  .lqe-logo-group { display: flex; align-items: baseline; gap: 12px; }
  .lqe-logo-text { font-family: 'Syne', sans-serif; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; color: #f0e8d5; }
  .lqe-logo-badge { font-size: 0.65rem; background: #d4a855; color: #0e1018; padding: 2px 8px; border-radius: 2px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .lqe-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #2a2d3a; border-bottom: 1px solid #2a2d3a; }
  .lqe-stat-card { background: #13161f; padding: 20px 28px; transition: background 0.2s; }
  .lqe-stat-label { font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6d7e; margin-bottom: 6px; }
  .lqe-stat-value { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 700; color: #d4a855; line-height: 1; }
  .lqe-stat-sub { font-size: 0.7rem; color: #4e5060; margin-top: 4px; }
  .lqe-body { display: flex; flex: 1; min-height: 0; }
  .lqe-sidebar { width: 240px; flex-shrink: 0; background: #13161f; border-right: 1px solid #2a2d3a; padding: 24px 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
  .lqe-sidebar-heading { font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6d7e; padding-bottom: 10px; border-bottom: 1px solid #2a2d3a; }
  .lqe-filter-group { display: flex; flex-direction: column; gap: 6px; }
  .lqe-filter-label { font-size: 0.65rem; color: #8b8ea0; letter-spacing: 0.08em; text-transform: uppercase; }
  .lqe-select { background: #0e1018; border: 1px solid #2a2d3a; color: #e8e2d4; padding: 9px 12px; border-radius: 4px; font-family: 'DM Mono', monospace; font-size: 0.78rem; cursor: pointer; outline: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23d4a855' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
  .lqe-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 0.65rem; background: rgba(212,168,85,0.12); color: #d4a855; border: 1px solid rgba(212,168,85,0.25); border-radius: 2px; padding: 3px 8px; cursor: pointer; }
  .lqe-main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  .lqe-map-wrap { height: 45vh; min-height: 280px; position: relative; border-bottom: 1px solid #2a2d3a; }
  .lqe-map-label { position: absolute; top: 14px; left: 14px; z-index: 999; font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase; background: rgba(14,16,24,0.85); color: #d4a855; padding: 5px 10px; border: 1px solid rgba(212,168,85,0.2); border-radius: 2px; backdrop-filter: blur(4px); pointer-events: none; }
  .lqe-map-count { position: absolute; bottom: 14px; left: 14px; z-index: 999; font-size: 0.68rem; background: rgba(14,16,24,0.85); color: #8b8ea0; padding: 5px 10px; border: 1px solid #2a2d3a; border-radius: 2px; backdrop-filter: blur(4px); pointer-events: none; }
  .lqe-table-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .lqe-table-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid #2a2d3a; background: #13161f; }
  .lqe-table-title { font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6d7e; }
  .lqe-dialog-body { line-height: 1.7; color: #b0b3c6; font-size: 0.82rem; }
  .leaflet-tooltip { background: #1a1d26 !important; border: 1px solid #d4a855 !important; color: #e8e2d4 !important; font-family: 'DM Mono', monospace !important; font-size: 0.72rem !important; }
  .MuiDataGrid-root { border: none !important; font-family: 'DM Mono', monospace !important; }
`;
document.head.appendChild(styleTag);

/* ─── Helpers ─── */
const fmtNum = n => n?.toLocaleString() ?? '—';
const totalHa = arr => arr.reduce((s, r) => s + (parseFloat(r.area_hectares) || 0), 0).toFixed(1);

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
        const withRisk = data.map(q => ({ ...q, riskScore: calculateRiskScore(q) }));
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
    { field: 'material', headerName: 'Material', flex: 1, minWidth: 150 },
    { field: 'status', headerName: 'Status', flex: 0.8, minWidth: 100, renderCell: ({ value }) => <StatusPill value={value} /> },
    { field: 'area_hectares', headerName: 'Area (Ha)', flex: 0.7, minWidth: 100, type: 'number', renderCell: ({ value }) => <span style={{ color: '#d4a855' }}>{value ? Number(value).toLocaleString() : '—'}</span> },
    { field: 'date_approved', headerName: 'Approved', flex: 0.9, minWidth: 110 },
  ];

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="lqe-root">
        <header className="lqe-header">
          <div className="lqe-logo-group">
            <span className="lqe-logo-text">Land Quarry Explorer</span>
            <span className="lqe-logo-badge">PH · 2025</span>
          </div>
          <button className="lqe-btn lqe-btn-ghost" style={{ background: 'transparent', color: '#8b8ea0', border: '1px solid #2a2d3a', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setIsModalOpen(true)}>
            Sources & Transparency
          </button>
        </header>

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

        <div className="lqe-body">
          <aside className="lqe-sidebar">
            <div className="lqe-sidebar-heading">Filter Data</div>
            <div className="lqe-filter-group">
              <label className="lqe-filter-label">Province</label>
              <select className="lqe-select" value={provinceFilter} onChange={e => { setProvinceFilter(e.target.value); setMaterialFilter(''); }}>
                <option value="">All Provinces</option>
                {uniqueProvinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="lqe-filter-group">
              <label className="lqe-filter-label">Material</label>
              <select className="lqe-select" value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}>
                <option value="">All Materials</option>
                {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button style={{ width: '100%', background: '#d4a855', color: '#0e1018', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }} onClick={exportToCSV}>
                ↓ Download CSV
              </button>
            </div>
          </aside>

          <main className="lqe-main">
            <div className="lqe-map-wrap">
              <div className="lqe-map-label">◉ Live Map View</div>
              <div className="lqe-map-count">{fmtNum(mappable.length)} geocoded permits</div>
              
              {/* ─── MODIFIED MAP CONTAINER ─── */}
              <MapContainer 
                center={[12.8797, 121.7740]} 
                zoom={6} 
                minZoom={6}
                maxBounds={phBounds}
                maxBoundsViscosity={1.0}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                />
                {mappable.map((quarry, i) => (
                  <CircleMarker
                    key={i}
                    center={[quarry.latitude, quarry.longitude]}
                    radius={6}
                    pathOptions={{ color: getRiskColor(quarry.riskScore), fillColor: getRiskColor(quarry.riskScore), fillOpacity: 0.7, weight: 1.5 }}
                  >
                    <Tooltip>
                      <div style={{ lineHeight: 1.6 }}>
                        <div style={{ color: '#d4a855', fontWeight: 500 }}>{quarry.contractor}</div>
                        <div>{quarry.material} · {quarry.province}</div>
                        <div style={{ color: getRiskColor(quarry.riskScore) }}>Risk: {quarry.riskScore}/100</div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            <div className="lqe-table-wrap">
              <div className="lqe-table-header">
                <span className="lqe-table-title">Permit Registry</span>
                <span style={{ color: '#d4a855' }}>{fmtNum(filteredData.length)} records</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                  rows={filteredData}
                  columns={columns}
                  getRowId={row => row.id ?? row.contractor + Math.random()}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  loading={loading}
                  sx={{ height: '100%', '& .MuiDataGrid-virtualScroller': { background: '#0e1018' } }}
                  disableRowSelectionOnClick
                />
              </div>
            </div>
          </main>
        </div>

        <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} PaperProps={{ style: { background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 6, maxWidth: 480 } }}>
          <DialogTitle style={{ color: '#f0e8d5' }}>Transparency & Sources</DialogTitle>
          <DialogContent className="lqe-dialog-body">
            <p><strong>Built by Team Hikarizz</strong> — a civic tech initiative for public governance data.</p>
            <br />
            <p><strong>Data Source:</strong> Mines and Geosciences Bureau (MGB) official records (CY-2025).</p>
          </DialogContent>
          <DialogActions style={{ padding: '12px 20px', borderTop: '1px solid #2a2d3a' }}>
            <Button onClick={() => setIsModalOpen(false)} sx={{ color: '#d4a855' }}>Close</Button>
          </DialogActions>
        </Dialog>
      </div>
    </ThemeProvider>
  );
}