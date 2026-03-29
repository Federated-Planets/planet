-- Travel Plans Table: Tracks active journeys
CREATE TABLE IF NOT EXISTS travel_plans (
    id TEXT PRIMARY KEY,
    ship_id TEXT NOT NULL,
    origin_url TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    start_timestamp INTEGER NOT NULL,
    end_timestamp INTEGER NOT NULL,
    status TEXT CHECK(status IN ('PREPARING', 'TRANSIT', 'ARRIVED')) NOT NULL DEFAULT 'PREPARING',
    signatures TEXT NOT NULL -- JSON array of cryptographic signatures
);

-- Mission Archive Table: Historical record of journeys
CREATE TABLE IF NOT EXISTS mission_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ship_id TEXT NOT NULL,
    event TEXT CHECK(event IN ('ARRIVED', 'DEPARTED')) NOT NULL,
    location_name TEXT NOT NULL,
    location_url TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

-- Traffic Controllers Cache: Known neighbors with space ports
CREATE TABLE IF NOT EXISTS traffic_controllers (
    planet_url TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    space_port_url TEXT NOT NULL,
    last_manifest_fetch INTEGER NOT NULL
);
