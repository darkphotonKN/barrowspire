-- FS-NXP1W Req 31: settlement step 4's record that it moved a listing's item to
-- the buyer. TransferItem writes it in the same transaction as the transfer, so a
-- row exists exactly when the transfer happened.
--
-- A retry decides "already applied" from this row, not from the item's current
-- owner and status. Those keep changing after the transfer: the buyer can relist
-- the item and sell it on, and then the item no longer shows that this transfer
-- ever happened (crash point #11, docs/crash-points/transfer-item.md).
--
-- No FKs: listings live in marketplace-service's database, and the record has to
-- outlive whatever later happens to the item.
CREATE TABLE item_transfers (
    -- a listing settles once, so it transfers its item at most once
    listing_id      UUID PRIMARY KEY,
    item_id         UUID NOT NULL,
    buyer_member_id UUID NOT NULL,
    transferred_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- audit: every settlement an item has changed hands in
CREATE INDEX idx_item_transfers_item ON item_transfers (item_id);
