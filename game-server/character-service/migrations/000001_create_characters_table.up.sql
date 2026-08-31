CREATE TABLE IF NOT EXISTS characters (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id  UUID NOT NULL,
    class_id   VARCHAR(32) NOT NULL,
    name       VARCHAR(32) NOT NULL,
    level      INTEGER NOT NULL DEFAULT 1,
    exp        BIGINT  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_characters_name
  ON characters(lower(name)) WHERE deleted_at IS NULL;

CREATE INDEX idx_characters_player
  ON characters(player_id, created_at) WHERE deleted_at IS NULL;