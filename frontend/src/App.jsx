import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DataGrid } from '@mui/x-data-grid';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

export default function LandQuarryExplorer() {
  const [allData, setAllData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [provinceFilter, setProvinceFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/api/quarries')
      .then(response => response.json())
      .then(data => {
        setAllData(data);
        setFilteredData(data);
      })
      .catch(error => console.error("Error fetching data:", error));
  }, []);

  useEffect(() => {
    let result = allData;
    if (provinceFilter) result = result.filter(item => item.province === provinceFilter);
    if (materialFilter) result = result.filter(item => item.material === materialFilter);
    setFilteredData(result);
  }, [provinceFilter, materialFilter, allData]);

  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    const headers = Object.keys(filteredData[0]).join(',');
    const rows = filteredData.map(obj => Object.values(obj).join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "quarry_data_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    { field: 'contractor', headerName: 'Company / Contractor', width: 300 },
    { field: 'province', headerName: 'Province', width: 150 },
    { field: 'municipality', headerName: 'Municipality', width: 150 },
    { field: 'barangay', headerName: 'Barangay', width: 150 },
    { field: 'material', headerName: 'Material', width: 200 },
    { field: 'status', headerName: 'Status', width: 150 },
    { field: 'area_hectares', headerName: 'Area (Ha)', width: 130, type: 'number' },
    { field: 'date_approved', headerName: 'Date Approved', width: 150 }
  ];

  const uniqueProvinces = [...new Set(allData.map(item => item.province))].filter(Boolean);
  const uniqueMaterials = [...new Set(allData.filter(item => !provinceFilter || item.province === provinceFilter).map(item => item.material))].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2>Land Quarry Explorer</h2>
        <Button variant="outlined" onClick={() => setIsModalOpen(true)}>Transparency & Sources</Button>
      </div>

      <div style={{ display: 'flex', gap: '20px', height: '40vh', marginBottom: '20px' }}>
        
        <div style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3>Filters</h3>
          <select value={provinceFilter} onChange={e => { setProvinceFilter(e.target.value); setMaterialFilter(''); }} style={{ padding: '8px' }}>
            <option value="">All Provinces</option>
            {uniqueProvinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)} style={{ padding: '8px' }}>
            <option value="">All Materials</option>
            {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          
          <Button variant="contained" color="primary" onClick={exportToCSV} style={{ marginTop: 'auto' }}>
            Export CSV
          </Button>
        </div>

        <div style={{ flex: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #ccc' }}>
          <MapContainer center={[14.1, 121.0]} zoom={8} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {filteredData.map((quarry, index) => (
              quarry.latitude && quarry.longitude ? (
                <CircleMarker key={index} center={[quarry.latitude, quarry.longitude]} radius={6} color="red" fillOpacity={0.7}>
                  <Tooltip>{quarry.contractor} - {quarry.material}</Tooltip>
                </CircleMarker>
              ) : null
            ))}
          </MapContainer>
        </div>
      </div>

      <div style={{ flex: '1', width: '100%' }}>
        <DataGrid 
          rows={filteredData} 
          columns={columns} 
          getRowId={(row) => row.id || (row.contractor ? row.contractor + Math.random() : Math.random())} 
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        />
      </div>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <DialogTitle>Transparency & Sources</DialogTitle>
        <DialogContent>
          <p><strong>Team Hikarizz</strong> built this platform to democratize public governance data.</p>
          <p>All data is sourced directly from the official Mines and Geosciences Bureau (MGB) public directories.</p>
          <p>Dataset: Directory of Operating Mines and Quarries CY-2025.</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </div>
  );
}