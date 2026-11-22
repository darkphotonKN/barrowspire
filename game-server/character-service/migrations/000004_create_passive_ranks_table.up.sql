-- One row per held passive tree node of a character (FS-8RZ51 §Requirements
-- 11). Unspent points are derived from the character's level and these ranks,
-- never stored (ADR-0083). A soft-deleted character keeps its rows (R15); the
-- cascade only fires on a hard delete.
CREATE TABLE IF NOT EXISTS passive_ranks (
    character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    node_id      TEXT        NOT NULL,
    rank         SMALLINT    NOT NULL CHECK (rank BETWEEN 1 AND 3),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, node_id)
);
