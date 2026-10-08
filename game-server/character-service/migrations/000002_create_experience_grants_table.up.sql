-- One row per run per character: the key that makes a redelivered match.ended
-- a no-op (FS-BDA7X §Requirements 25–26). Amount is the delta added to
-- characters.exp when the row was recorded.
CREATE TABLE IF NOT EXISTS experience_grants (
    session_id   UUID        NOT NULL,
    character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    amount       BIGINT      NOT NULL CHECK (amount > 0),
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, character_id)
);
