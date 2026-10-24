CREATE TABLE catalog_quests (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'human' | 'ai'
  place_name TEXT,
  place_lat REAL,
  place_lng REAL,
  place_radius INTEGER,
  lobby_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  times_submitted INTEGER NOT NULL,
  times_verified INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0   -- reserved for a later "publish publicly" step; unused for now
);
