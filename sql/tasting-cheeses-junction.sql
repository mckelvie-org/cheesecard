-- Many-to-many junction between tastings and cheeses.
-- Replaces cheeses.tasting_id (FK) with a proper junction table so the
-- same canonical cheese can appear in multiple tastings while sharing
-- a single set of reviews and discussion threads.

-- 1. Create junction table
CREATE TABLE tasting_cheeses (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tasting_id uuid        NOT NULL REFERENCES tastings(id)  ON DELETE CASCADE,
  cheese_id  uuid        NOT NULL REFERENCES cheeses(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tasting_id, cheese_id)
);

-- 2. Migrate existing cheeses.tasting_id data
INSERT INTO tasting_cheeses (tasting_id, cheese_id, created_at)
SELECT tasting_id, id, created_at FROM cheeses WHERE tasting_id IS NOT NULL;

-- 3. Drop the old FK column from cheeses
ALTER TABLE cheeses DROP COLUMN tasting_id;

-- 4. Case-insensitive unique index on cheese name
CREATE UNIQUE INDEX cheeses_name_unique_ci ON cheeses (LOWER(name));

-- 5. Realtime support
ALTER TABLE tasting_cheeses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE tasting_cheeses;

-- 6. RLS
ALTER TABLE tasting_cheeses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasting_cheeses: authenticated select"
  ON tasting_cheeses FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasting_cheeses: authenticated insert"
  ON tasting_cheeses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasting_cheeses: admin delete"
  ON tasting_cheeses FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
