ALTER TABLE item_instances DROP CONSTRAINT item_instances_status_check;

UPDATE item_instances SET status = 'IN_ESCROW' WHERE status = 'PENDING_SETTLEMENT';

ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_status_check
        CHECK (status IN ('AVAILABLE', 'LISTED', 'IN_ESCROW'));
