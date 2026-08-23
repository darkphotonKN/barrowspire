DROP INDEX IF EXISTS idx_bids_idempotency_key;

ALTER TABLE bids DROP COLUMN IF EXISTS idempotency_key;

-- Restore the pre-saga lifecycle. This fails if any bid is still PENDING or
-- FAILED, which is intended: rolling back with saga rows in flight would leave
-- bids in a state the old code cannot interpret.
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_status_check;

ALTER TABLE bids ADD CONSTRAINT bids_status_check
    CHECK (status IN ('WINNING', 'OUTBID', 'WON', 'CANCELLED'));
