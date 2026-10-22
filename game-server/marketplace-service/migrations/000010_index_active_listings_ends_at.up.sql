-- ACTIVE listings by end time, for the two reads that ask for exactly that: the
-- expiry poller (ACTIVE and ends_at <= now, paged by (ends_at, id); FS-NXP1W Req 2)
-- and browse (ACTIVE, soonest ending first). Partial on ACTIVE so settled,
-- expired and cancelled listings, which only accumulate, never enter it.
CREATE INDEX IF NOT EXISTS idx_listings_active_ends_at ON listings (ends_at, id) WHERE status = 'ACTIVE';
