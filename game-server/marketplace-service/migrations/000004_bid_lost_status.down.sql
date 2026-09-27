-- Fails while any bid is LOST, which is intended: rolling back with settled
-- rows present would leave bids in a status the old code cannot interpret.
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_status_check;

ALTER TABLE bids ADD CONSTRAINT bids_status_check
    CHECK (status IN ('PENDING', 'WINNING', 'OUTBID', 'WON', 'CANCELLED', 'FAILED'));
