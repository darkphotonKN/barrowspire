-- Rename the on-sale listing status LISTED -> ACTIVE, the name the specs and
-- ADR-0016 / ADR-0018 use throughout. LISTED stays the item's word for the same
-- moment (items-service owns it, ADR-0017), so listings must not reuse it or the
-- freeze steps read ambiguously.
--
-- DRAFT is dropped rather than admitted: the CHECK never allowed it and no row
-- ever held it — CreateListing published before its first INSERT — so the domain
-- is now born ACTIVE.
--
-- Order is load-bearing: the CHECK has to go before the rows can be rewritten,
-- and the partial index has to be rebuilt because its predicate names the status.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

UPDATE listings SET status = 'ACTIVE' WHERE status = 'LISTED';

ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('ACTIVE', 'SOLD', 'PENDING_SETTLEMENT', 'CANCELLED', 'EXPIRED'));

-- same one-live-listing-per-item rule, restated over the new value
DROP INDEX IF EXISTS idx_one_active_listing_per_item;

CREATE UNIQUE INDEX idx_one_active_listing_per_item ON listings(item_id) WHERE status = 'ACTIVE';
