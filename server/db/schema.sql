CREATE TABLE IF NOT EXISTS parents (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS child_devices (
  id                TEXT PRIMARY KEY,
  parent_id         TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  label             TEXT NOT NULL DEFAULT 'Child device',
  device_token_hash TEXT NOT NULL,
  desired_tracking  INTEGER NOT NULL DEFAULT 0,
  is_online         INTEGER NOT NULL DEFAULT 0,
  last_seen_at      INTEGER,
  last_lat          REAL,
  last_lng          REAL,
  last_fix_at       INTEGER,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS location_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL REFERENCES child_devices(id) ON DELETE CASCADE,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  accuracy_m  REAL,
  speed_mps   REAL,
  recorded_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_location_points_device_time ON location_points(device_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_child_devices_parent ON child_devices(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
