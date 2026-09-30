-- FS-NXP1W Req 22: the settlement freeze (step 0b) needs an item state distinct
-- from LISTED. IN_ESCROW was reserved for it but never written by any code path,
-- so it is renamed rather than kept beside a second name for the same state.
ALTER TABLE item_instances DROP CONSTRAINT item_instances_status_check;

UPDATE item_instances SET status = 'PENDING_SETTLEMENT' WHERE status = 'IN_ESCROW';

ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_status_check
        CHECK (status IN ('AVAILABLE', 'LISTED', 'PENDING_SETTLEMENT'));
