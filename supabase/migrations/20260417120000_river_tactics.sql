-- River tactics: static editorial content per river
CREATE TABLE IF NOT EXISTS river_tactics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  river_id uuid REFERENCES rivers(id) UNIQUE NOT NULL,
  about text,
  character text,
  best_sections jsonb,  -- array of {name: string, description: string}
  best_months jsonb,    -- array of {month: string, notes: string}
  techniques text,
  regulations_notes text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS river_tactics_river_id_idx ON river_tactics(river_id);
