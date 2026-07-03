CREATE TABLE IF NOT EXISTS wallet_hold (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    bid_id UUID NOT NULL, -- soft reference to bid's id
    status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    amount BIGINT NOT NULL,
    expiry_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (bid_id) -- natural idempotency key
);

-- three indexes for three different purposes

-- A: sweeper, sweeps for expired holds to release by background job.
-- query would be WHERE status='RESERVED' AND expiry_date < now()
CREATE INDEX idx_wallet_hold_sweep ON wallet_hold(expiry_date) WHERE status = 'RESERVED';

-- B: look up specific bid or account to commit or release during the saga.
-- query would be WHERE bid_id = x or WHERE account_id = y AND bid_id = z
-- CREATE INDEX idx_wallet_hold_bid ON wallet_hold(bid_id);
-- NOT NEEDED ANYMORE, leaving comment for legacy reasons

-- C) Idempotency / uniqueness — "does a hold already exist for this bid?" so you don't double-reserve. This is enforced by the unique constraint which naturally has an index
