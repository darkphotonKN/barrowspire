DROP INDEX IF EXISTS idx_listings_withdrawal_unstarted;

ALTER TABLE listings DROP COLUMN IF EXISTS withdrawal_started_at;
