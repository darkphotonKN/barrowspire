ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_buyout_price_check;

ALTER TABLE listings DROP COLUMN IF EXISTS buyout_price;
