-- Back to LISTED. DRAFT is not restored: nothing was ever stored under it.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

UPDATE listings SET status = 'LISTED' WHERE status = 'ACTIVE';

ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('LISTED', 'SOLD', 'PENDING_SETTLEMENT', 'CANCELLED', 'EXPIRED'));

DROP INDEX IF EXISTS idx_one_active_listing_per_item;

CREATE UNIQUE INDEX idx_one_active_listing_per_item ON listings(item_id) WHERE status = 'LISTED';
