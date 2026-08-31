-- Migration 019: Add character_id column to player_loadouts and item_instances for multi-character support
ALTER TABLE player_loadouts ADD COLUMN character_id UUID;
CREATE INDEX idx_player_loadouts_character ON player_loadouts(character_id);

ALTER TABLE item_instances ADD COLUMN character_id UUID;
CREATE INDEX idx_item_instances_character ON item_instances(character_id);
