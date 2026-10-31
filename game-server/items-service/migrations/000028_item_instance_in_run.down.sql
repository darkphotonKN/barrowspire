DROP INDEX IF EXISTS item_instances_run_id_idx;

ALTER TABLE item_instances DROP CONSTRAINT IF EXISTS item_instances_run_id_check;

-- the older check has no IN_RUN: whatever is still in a run comes home
UPDATE item_instances SET status = 'AVAILABLE' WHERE status = 'IN_RUN';

ALTER TABLE item_instances DROP COLUMN IF EXISTS run_id;

ALTER TABLE item_instances DROP CONSTRAINT item_instances_status_check;

ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_status_check
        CHECK (status IN ('AVAILABLE', 'LISTED', 'PENDING_SETTLEMENT'));
