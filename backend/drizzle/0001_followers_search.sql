CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_status') THEN
    CREATE TYPE follow_status AS ENUM ('pending', 'accepted');
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE follows
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE follows
  ALTER COLUMN status TYPE follow_status
  USING status::follow_status;

ALTER TABLE follows
  ALTER COLUMN status SET DEFAULT 'accepted';

CREATE INDEX IF NOT EXISTS idx_users_username_lower_trgm
  ON users USING GIN (lower(username) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_full_name_lower_trgm
  ON users USING GIN (lower(full_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_search_tsv
  ON users USING GIN (
    to_tsvector('simple', coalesce(username, '') || ' ' || coalesce(full_name, ''))
  );
