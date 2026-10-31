-- FS-18Z5F R1, R2 (ADR-0032): an instance checked out into a run or field
-- world is IN_RUN, tagged with that world's id. Every write that needs an
-- AVAILABLE (or LISTED) item already matches on status, so IN_RUN fails it as
-- is. run_id is the run fence, copied from listing_id (FS-NXP1W R8): release and
-- settlement act only on instances carrying their run's id, and the member's
-- next checkout re-tags orphans still fenced by an older run.
--
-- No FK: runs live in game-service.
ALTER TABLE item_instances DROP CONSTRAINT item_instances_status_check;

ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_status_check
        CHECK (status IN ('AVAILABLE', 'LISTED', 'PENDING_SETTLEMENT', 'IN_RUN'));

ALTER TABLE item_instances ADD COLUMN run_id UUID;

-- an instance is in a run exactly when it says which run
ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_run_id_check
        CHECK ((status = 'IN_RUN') = (run_id IS NOT NULL));

-- serves settlement's release of every instance a run checked out
CREATE INDEX item_instances_run_id_idx
    ON item_instances (run_id)
    WHERE run_id IS NOT NULL;
