-- FS-50MTX: back to one loadout per account. Loadouts are cleared, since one
-- member may hold several by now. Old items are not put back: instances stay
-- where they are, and only the holder is forgotten, so a later up cannot find a
-- stash row with a holder once the code from before this migration has moved it.
ALTER TABLE item_instances DROP CONSTRAINT item_instances_holder_check;

ALTER TABLE player_loadouts DROP CONSTRAINT player_loadouts_character_id_key;

ALTER TABLE player_loadouts ALTER COLUMN character_id DROP NOT NULL;

DELETE FROM player_loadouts;

ALTER TABLE player_loadouts
    ADD CONSTRAINT player_loadouts_member_id_key UNIQUE (member_id);

UPDATE item_instances SET character_id = NULL WHERE character_id IS NOT NULL;
