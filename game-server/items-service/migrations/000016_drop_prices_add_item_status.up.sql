-- Remove all price / buyout columns from items. Pricing moves out of the
-- items-service (marketplace/wallet own economy concerns now).
ALTER TABLE item_templates
    DROP COLUMN IF EXISTS base_sell_price,
    DROP COLUMN IF EXISTS base_buy_price;

ALTER TABLE item_instances
    DROP COLUMN IF EXISTS buy_price,
    DROP COLUMN IF EXISTS sell_price;

-- Add a lifecycle status to owned item instances. Only three states are valid.
ALTER TABLE item_instances
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'LISTED', 'IN_ESCROW'));
