DROP TABLE IF EXISTS quarries;

CREATE TABLE quarries (
    id INTEGER,
    barangay TEXT,
    municipality TEXT,
    province TEXT,
    region TEXT,
    commodity TEXT,
    contractor TEXT,
    operator TEXT,
    managing_official TEXT,
    permit_type TEXT,
    date_approved TEXT,
    date_expired TEXT,
    area_hectares REAL,
    status TEXT,
    tin TEXT,
    remarks TEXT,
    year INTEGER,
    latitude REAL,
    longitude REAL
);

CREATE INDEX IF NOT EXISTS idx_quarries_province ON quarries (province);
CREATE INDEX IF NOT EXISTS idx_quarries_commodity ON quarries (commodity);
CREATE INDEX IF NOT EXISTS idx_quarries_contractor ON quarries (contractor);
CREATE INDEX IF NOT EXISTS idx_quarries_status ON quarries (status);
