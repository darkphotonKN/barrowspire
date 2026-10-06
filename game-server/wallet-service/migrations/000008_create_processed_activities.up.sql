-- FS-NXP1W §Requirements 23, 30. The dedup record for settlement activities that
-- have no prior state to make them idempotent — today only CreditSeller, which
-- writes its row in the SAME transaction as the credit.
--
-- A separate table from processed_events on purpose. That one is the inbox for
-- broker events and is keyed on a UUID event id; a settlement step is identified
-- by the caller-minted key (workflow ID + activity name, ADR-0009), which is a
-- string. Widening event_id to TEXT would loosen the inbox for every consumer to
-- make room for a key that means something else.
--
-- No output column: an already-applied credit answers with the seller's account
-- id, which is found again from the seller, not remembered here.
CREATE TABLE processed_activities (
    idempotency_key TEXT NOT NULL PRIMARY KEY,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
