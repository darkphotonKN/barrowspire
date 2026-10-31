-- FS-VPD8Y R1, R3: where the owner keeps each instance, the bag (carried, 30)
-- or the stash (town storage, 60). Worn is not a value here: it stays the
-- loadout table, and a worn instance keeps whatever this column says (R2).
--
-- Every existing instance starts in the stash, worn ones included, so the bag
-- starts empty and nothing is lost (R3). The default keeps that true for any
-- insert that does not say where (dev seeds); the writes the FS names set it
-- themselves: extraction writes BAG (R9), a transfer writes STASH (R7).
ALTER TABLE item_instances
    ADD COLUMN location VARCHAR(10) NOT NULL DEFAULT 'STASH'
        CONSTRAINT item_instances_location_check CHECK (location IN ('BAG', 'STASH'));
