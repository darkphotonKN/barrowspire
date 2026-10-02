-- FS-NXP1W Req 8: the listing an item is reserved for. Status alone cannot tell
-- an old listing from a new one, so a retried release (or any later step) for a
-- finished listing could hit the item after the seller relists it. Writes that
-- act for a listing check this ID as well as the status. Release clears it, and
-- the next reservation sets a new one.
--
-- No FK: listings live in marketplace-service's database.
ALTER TABLE item_instances ADD COLUMN listing_id UUID;

-- An item belongs to at most one listing at a time, and a listing to one item.
CREATE UNIQUE INDEX item_instances_listing_id_key
    ON item_instances (listing_id)
    WHERE listing_id IS NOT NULL;
