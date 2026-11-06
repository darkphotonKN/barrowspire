-- Every wallet write loads an account together with all of its holds
-- (FindByID / FindByMemberID: SELECT … FROM wallet_holds WHERE account_id = $1),
-- inside the account's transaction: PlaceHold, ReleaseHold, CommitHold,
-- CreditSeller, the settlement release steps and the hold sweeps.
--
-- wallet_holds was only indexed by bid_id (UNIQUE) and two partial indexes over
-- RESERVED rows, so that read scanned the whole table, and holds are never
-- deleted: every bid ever placed by anyone made every later wallet write slower.
--
-- All statuses, not only RESERVED: the aggregate is reconstituted with every one of
-- its holds, so the read needs them all.
CREATE INDEX IF NOT EXISTS idx_wallet_holds_account_id
    ON wallet_holds(account_id);
