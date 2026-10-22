-- FS-NXP1W Req 24: the durable, human-facing record of a settlement that parked
-- (escalate and park, Req 10) or rolled back (Req 12). The workflow keeps the
-- saga's position; this row is what an operator reads and audits.
--
-- No FK on listing_id to keep the row writable whatever state the listing is in.
CREATE TABLE settlement_exceptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL,
    workflow_id TEXT NOT NULL,
    -- the activity that exhausted its cap or reported an impossibility, named as
    -- the workflow schedules it; it spans services, so it is free text
    step        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN'
        CONSTRAINT settlement_exceptions_status_check CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ NULL,
    -- Req 24 lists it; settlement.failed itself goes through the outbox table
    published_at TIMESTAMPTZ NULL
);

-- RaiseSettlementException is retried without a cap, and a park loop raises
-- again for the same step on every lap. One OPEN row per (workflow, step) keeps
-- both from multiplying rows: a repeat raise finds the open one instead.
CREATE UNIQUE INDEX settlement_exceptions_open_step_key
    ON settlement_exceptions (workflow_id, step)
    WHERE status = 'OPEN';

-- operator view: what is stuck on this listing
CREATE INDEX idx_settlement_exceptions_listing ON settlement_exceptions (listing_id);
