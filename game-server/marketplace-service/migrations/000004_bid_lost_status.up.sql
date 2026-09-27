-- Admit LOST, settlement's terminal status for every bid that did not win
-- (FS-NXP1W Req 21). Schema only: the transitions into LOST arrive with the
-- settlement slices that need them (rollback, release of losing holds).
-- Existing rows are untouched: every current status stays legal.
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_status_check;

ALTER TABLE bids ADD CONSTRAINT bids_status_check
    CHECK (status IN ('PENDING', 'WINNING', 'OUTBID', 'WON', 'LOST', 'CANCELLED', 'FAILED'));
