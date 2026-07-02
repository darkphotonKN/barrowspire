-- Reverse: drop status and restore the price columns to their original shape.
ALTER TABLE item_instances
    DROP COLUMN IF EXISTS status;

ALTER TABLE item_instances
    ADD COLUMN buy_price INTEGER,
    ADD COLUMN sell_price INTEGER;

ALTER TABLE item_templates
    ADD COLUMN base_sell_price INTEGER DEFAULT 0,
    ADD COLUMN base_buy_price INTEGER DEFAULT 0;
