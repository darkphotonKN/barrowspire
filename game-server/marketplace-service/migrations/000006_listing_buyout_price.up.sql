-- The seller's optional buyout price (FS-9XKS6). NULL is "no buyout": the
-- listing can only be won by bidding. Every existing row stays NULL, so this is
-- additive and needs no backfill.
--
-- The CHECK backstops the domain's rule that a buyout sits strictly above the
-- start price; a buyout at the opening bid would just be a bid.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS buyout_price BIGINT;

ALTER TABLE listings ADD CONSTRAINT listings_buyout_price_check
    CHECK (buyout_price IS NULL OR buyout_price > start_price);
