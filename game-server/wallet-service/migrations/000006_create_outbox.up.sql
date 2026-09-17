-- FS-9KW9F §Requirements 12, 20. wallet's own outbox, so an account insert and
-- the account.created announcing it commit or roll back together.
--
-- Same shape as auth-service's 000009_create_outbox: common/outbox's repository
-- and worker are shared code and expect these columns. The TABLE is wallet's
-- own, in wallet's own database.
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    routing_key VARCHAR(255) NOT NULL,
    exchange VARCHAR(255) NOT NULL,
    payload BYTEA NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- null = pending, not null = published
    published_at TIMESTAMPTZ NULL
);

-- The worker's hot path: pending rows in FIFO order.
CREATE INDEX idx_outbox_pending ON outbox (created_at)
    WHERE published_at IS NULL;

-- Periodic cleanup of already-published rows.
CREATE INDEX idx_outbox_cleanup ON outbox (published_at)
    WHERE published_at IS NOT NULL;
