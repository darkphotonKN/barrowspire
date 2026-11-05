-- When the withdraw-listing workflow of a CANCELLED listing was started (FS-V7A5S
-- Req 8 as amended 2026-11-05). NULL until a start lands, or until the starter
-- answers already-started; the withdraw backstop starts exactly the CANCELLED
-- listings still NULL, however long ago they were withdrawn. Only "started" is
-- recorded, never "finished": once started, the workflow's uncapped retries
-- finish it.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS withdrawal_started_at TIMESTAMPTZ NULL;

-- The backstop's read: CANCELLED and not yet started, paged by (updated_at, id).
-- Partial on exactly that, so withdrawals already started, which only
-- accumulate, never enter it and the normally empty candidate set stays cheap.
CREATE INDEX IF NOT EXISTS idx_listings_withdrawal_unstarted ON listings (updated_at, id)
    WHERE status = 'CANCELLED' AND withdrawal_started_at IS NULL;
