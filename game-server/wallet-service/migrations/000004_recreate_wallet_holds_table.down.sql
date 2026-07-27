-- Back to the singular table with expiry_date, as 000002 left it.
-- Dropping the table also drops its indexes and the UNIQUE constraint.
DROP TABLE IF EXISTS wallet_holds;

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

CREATE INDEX idx_wallet_hold_sweep ON wallet_hold(expiry_date) WHERE status = 'RESERVED';
