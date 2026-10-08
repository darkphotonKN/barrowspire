-- The reconciler looks for reservations that outlived the write meant to follow
-- them, which is a matter of seconds — so it filters on created_at, not expired_at.
--
-- idx_wallet_holds_sweep already covers (expired_at) WHERE status = 'RESERVED', but
-- expiry is sized for settlement: a listing's end plus a grace. A hold orphaned on
-- day one of a week-long auction does not look expired for a week, so that index
-- answers a different question and is left in place for the expiry sweeper that
-- eventually uses it.
CREATE INDEX IF NOT EXISTS idx_wallet_holds_stale
    ON wallet_holds(created_at)
    WHERE status = 'RESERVED';
