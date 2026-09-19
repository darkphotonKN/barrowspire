CREATE TABLE IF NOT EXISTS listings (
    id          UUID PRIMARY KEY,
    seller_id   UUID NOT NULL,
    buyer_id    UUID,                
    item_id     UUID NOT NULL,
    start_price BIGINT NOT NULL,
    sold_price  BIGINT,                  
    status      TEXT NOT NULL CHECK(status IN ('LISTED', 'SOLD', 'PENDING_SETTLEMENT', 'CANCELLED', 'EXPIRED')),
    ends_at     TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    version     INT NOT NULL DEFAULT 0
);




-- generic index when no filters but the default "LISTING" is on, sorted by date
-- this is due to baseline filter is always on LISTED to browse items for purchasing
-- id for tie breaking
CREATE INDEX idx_listings_created_at ON listings(status, created_at, id);

-- for the common case of filtering by gold range for bids
CREATE INDEX idx_listings_start_price ON listings(status, start_price, id);

-- for the common case of filtering by gold range for buyouts
CREATE INDEX idx_listings_sold_price ON listings(status, sold_price, id);

-- for the sellers browsing their own items
CREATE INDEX idx_listings_seller_id ON listings(seller_id, created_at);

-- prevent duplicates from being listed
CREATE UNIQUE INDEX listings(item_id) WHERE status = 'LISTED';
-- for detail pages narrowing on one particular item, no presort needed as only one (or no) match possible
-- un needed cuz of the above, and ONLY needed for listed anyway which can ONLY be copvered by unique index above
-- CREATE INDEX idx_listings_sold_price ON listings(item_id) 


