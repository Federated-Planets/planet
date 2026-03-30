-- Travel Plans Table: Tracks all journeys (active and historical)
CREATE TABLE IF NOT EXISTS travel_plans (
    id TEXT PRIMARY KEY,
    ship_id TEXT NOT NULL,
    origin_url TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    start_timestamp INTEGER NOT NULL,
    end_timestamp INTEGER NOT NULL,
    status TEXT CHECK(status IN ('PREPARING', 'PLAN_ACCEPTED')) NOT NULL DEFAULT 'PREPARING',
    signatures TEXT NOT NULL -- JSON array of cryptographic signatures
);

-- Index for fast retrieval of active plans (not yet arrived)
CREATE INDEX IF NOT EXISTS idx_travel_plans_active ON travel_plans (end_timestamp, origin_url, destination_url);

-- Traffic Controllers Cache: Known neighbors with space ports
CREATE TABLE IF NOT EXISTS traffic_controllers (
    planet_url TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    space_port_url TEXT NOT NULL,
    last_manifest_fetch INTEGER NOT NULL
);
