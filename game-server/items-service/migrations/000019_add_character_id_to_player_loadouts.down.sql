DROP INDEX IF EXISTS idx_item_instances_character;
ALTER TABLE item_instances DROP COLUMN IF EXISTS character_id;

DROP INDEX IF EXISTS idx_player_loadouts_character;
ALTER TABLE player_loadouts DROP COLUMN IF EXISTS character_id;
