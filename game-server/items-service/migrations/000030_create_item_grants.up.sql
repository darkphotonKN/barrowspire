-- FS-1GZGD R20, ADR-0044. One row per item grant, written in the transaction
-- that mints it, so a grant id is recorded exactly when its items exist. The
-- primary key is what makes a grant idempotent: a repeat, sequential or
-- concurrent, conflicts on it and mints nothing.
--
-- grant_id is the caller's key (ADR-0009), opaque text. item_ids are the
-- minted instances in mint order, the answer a repeat gets back; they are not
-- foreign keys, since a minted item may later be sold or used up.
CREATE TABLE item_grants (
    grant_id   TEXT PRIMARY KEY CHECK (char_length(grant_id) BETWEEN 1 AND 200),
    member_id  UUID NOT NULL,
    item_ids   UUID[] NOT NULL CHECK (cardinality(item_ids) >= 1),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
