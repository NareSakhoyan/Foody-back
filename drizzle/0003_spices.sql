ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "spices" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "steps";
