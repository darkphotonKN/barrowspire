-- Recreate the holds table under its plural name with expired_at instead of
-- expiry_date, matching the names the repository and read query already use.
-- Dropping rather than renaming: no hold data is worth preserving yet, and a
-- RESERVED hold that outlives its bid is worse than no hold at all.
DROP TABLE IF EXISTS wallet_hold;

CREATE TABLE IF NOT EXISTS wallet_holds (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    bid_id UUID NOT NULL, -- soft reference to bid's id
    status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    amount BIGINT NOT NULL,
    expired_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (bid_id) -- natural idempotency key
);

-- three indexes for three different purposes

-- A: sweeper, sweeps for expired holds to release by background job.
-- query would be WHERE status='RESERVED' AND expired_at < now()
CREATE INDEX idx_wallet_holds_sweep ON wallet_holds(expired_at) WHERE status = 'RESERVED';

-- B: look up specific bid or account to commit or release during the saga.
-- query would be WHERE bid_id = x or WHERE account_id = y AND bid_id = z
-- CREATE INDEX idx_wallet_holds_bid ON wallet_holds(bid_id);
-- NOT NEEDED ANYMORE, leaving comment for legacy reasons

-- C) Idempotency / uniqueness — "does a hold already exist for this bid?" so you don't double-reserve. This is enforced by the unique constraint which naturally has an index
