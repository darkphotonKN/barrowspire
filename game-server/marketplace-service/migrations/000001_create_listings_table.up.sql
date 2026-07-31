CREATE TABLE IF NOT EXISTS listings (
    id          UUID PRIMARY KEY,
    seller_id   UUID NOT NULL,
    buyer_id    UUID,                
    item_id     UUID NOT NULL,
    start_price BIGINT NOT NULL,
    sold_price  BIGINT,                  
    status      VARCHAR(32) NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    version     INT NOT NULL DEFAULT 0
);
