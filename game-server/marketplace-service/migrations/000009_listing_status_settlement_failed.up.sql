-- Admit SETTLEMENT_FAILED, the final status a pre-pivot rollback leaves a listing
-- in when its settlement can never succeed (FS-NXP1W Req 12, Req 20). It is not
-- ACTIVE, so the one-live-listing-per-item index needs no change: the item is
-- free to be listed again.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('ACTIVE', 'SOLD', 'PENDING_SETTLEMENT', 'CANCELLED', 'EXPIRED', 'SETTLEMENT_FAILED'));
