CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS recipes_visibility_status_idx ON recipes (is_public, author_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS recipe_tags_tag_idx ON recipe_tags (tag_id, recipe_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pantry_items_user_active_idx ON pantry_items (user_id, is_finished) WHERE is_finished = false;
