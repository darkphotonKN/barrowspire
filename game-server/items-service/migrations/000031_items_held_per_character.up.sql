-- FS-50MTX R1-R4, R7, R8 (ADR-0072): a character holds what is in its bag and
-- wears its own loadout; the account keeps owning every instance. No backfill:
-- no old item or loadout is assigned to a character, so old loadouts are gone
-- while their items survive, and old bag items join the shared stash, whatever
-- their status.
DELETE FROM player_loadouts WHERE character_id IS NULL;

UPDATE item_instances
SET location = 'STASH'
WHERE location = 'BAG'
AND character_id IS NULL;

-- created inline by migration 000006
ALTER TABLE player_loadouts DROP CONSTRAINT player_loadouts_member_id_key;

ALTER TABLE player_loadouts ALTER COLUMN character_id SET NOT NULL;

ALTER TABLE player_loadouts
    ADD CONSTRAINT player_loadouts_character_id_key UNIQUE (character_id);

-- an instance has a holder exactly when it is in a bag (R2)
ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_holder_check
        CHECK ((location = 'BAG') = (character_id IS NOT NULL));
