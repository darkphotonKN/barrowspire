CREATE TABLE IF NOT EXISTS bids (
    id          UUID PRIMARY KEY,
    listing_id  UUID NOT NULL REFERENCES listings(id),
    member_id   UUID NOT NULL, -- soft reference to auth-service's member
    type        VARCHAR(32) NOT NULL CHECK (type IN ('BID', 'BUYOUT')),
    amount      BIGINT NOT NULL CHECK (amount > 0),
    status      VARCHAR(32) NOT NULL CHECK (status IN ('WINNING', 'OUTBID', 'WON', 'CANCELLED')),
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_bids_single_winner ON bids(listing_id) WHERE status = 'WINNING';
CREATE INDEX idx_bids_listing ON bids(listing_id);
CREATE INDEX idx_bids_member ON bids(member_id);
