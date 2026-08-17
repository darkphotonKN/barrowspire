CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_listing_per_item
ON listings(item_id)
WHERE status IN ('ACTIVE', 'DRAFT');