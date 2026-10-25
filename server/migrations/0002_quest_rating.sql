-- Optional star ratings judges give a quest while verifying (1–5). NULL until someone rates it.
ALTER TABLE catalog_quests ADD COLUMN rating REAL;
ALTER TABLE catalog_quests ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
