-- Mailbox (FS-1GZGD, ADR-0044): letters and their per-member state.

-- One row per stored letter. member_id NULL addresses every member: a
-- broadcast is stored once (D3). A send to a member list stores one ordinary
-- one-member row per recipient; nothing marks it as a list send (A6).
CREATE TABLE letters (
    id          UUID PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    sender      TEXT NOT NULL CHECK (sender IN ('official', 'system')),
    member_id   UUID,
    -- [{"kind":"item","quantity":n,"item":{snapshot}} | {"kind":"gold","gold":n}]
    -- Each item is the snapshot resolved at send (A2); never re-read later.
    enclosures  JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(enclosures) = 'array'),
    sent_at     TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > sent_at)
);

-- a member's own letters, newest first
CREATE INDEX letters_member_sent_at_idx ON letters (member_id, sent_at DESC) WHERE member_id IS NOT NULL;
-- broadcasts, newest first
CREATE INDEX letters_broadcast_sent_at_idx ON letters (sent_at DESC) WHERE member_id IS NULL;

-- One row per (letter, member), created lazily on that member's first read or
-- claim (R6). No row means unread and unclaimed. The claim (I-1GZGD-4) locks
-- this row while it calls items and wallet (ADR-0044 §Decision 3), and moves
-- claim_state out of 'unclaimed' with a conditional UPDATE. claim_state is
-- meaningless for a letter without enclosures; the read reports 'none' then.
CREATE TABLE letter_states (
    letter_id   UUID NOT NULL REFERENCES letters (id) ON DELETE CASCADE,
    member_id   UUID NOT NULL,
    read_at     TIMESTAMPTZ,
    claim_state TEXT NOT NULL DEFAULT 'unclaimed' CHECK (claim_state IN ('unclaimed', 'claiming', 'claimed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (letter_id, member_id)
);
