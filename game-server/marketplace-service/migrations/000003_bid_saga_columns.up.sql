-- Widen the bid lifecycle for the wallet saga and give bids an idempotency key.
--
-- A bid no longer starts life as WINNING. It is created PENDING while wallet
-- places the hold, then confirmed to WINNING or marked FAILED. Existing rows are
-- untouched: every current status stays legal under the new constraint.

-- The original CHECK was declared inline and so carries Postgres' generated
-- name. Dropping by that name is safe here because 000002 is the only migration
-- that has ever defined it.
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_status_check;

ALTER TABLE bids ADD CONSTRAINT bids_status_check
    CHECK (status IN ('PENDING', 'WINNING', 'OUTBID', 'WON', 'CANCELLED', 'FAILED'));

-- Idempotency key for bid placement. Nullable because bids written before this
-- migration have none, and because the column is only meaningful for writes that
-- arrive with a client-supplied key.
ALTER TABLE bids ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Partial unique: NULLs are excluded outright rather than relying on the rule
-- that NULLs never collide, so the intent is explicit — at most one bid per key,
-- and any number of bids without one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_idempotency_key
    ON bids (idempotency_key) WHERE idempotency_key IS NOT NULL;
