CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pantry_items_name_trgm_idx
  ON pantry_items
  USING gin (lower(name) gin_trgm_ops);
