-- Lossy: the old CHECK has no SETTLEMENT_FAILED, so those rows become CANCELLED,
-- the closest final status that is also never re-settled.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

UPDATE listings SET status = 'CANCELLED' WHERE status = 'SETTLEMENT_FAILED';

ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('ACTIVE', 'SOLD', 'PENDING_SETTLEMENT', 'CANCELLED', 'EXPIRED'));
