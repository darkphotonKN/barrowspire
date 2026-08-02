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


-- sweeper, sweeps for expired holds to release by background job.
-- query would be WHERE status='RESERVED' AND expired_at < now()
CREATE INDEX idx_wallet_holds_sweep ON wallet_holds(expired_at) WHERE status = 'RESERVED';
