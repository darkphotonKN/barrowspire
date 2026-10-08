-- Migration 024 down. The Fabled -> Runed relabel is NOT undone: relabelled
-- instances stay Runed.
--
-- !! DESTRUCTIVE: every ring instance and ring template is deleted (the old
-- !! item_type CHECKs cannot hold them); loadout slots that held a ring are
-- !! nulled by ON DELETE SET NULL. Unique templates stay, without their
-- !! unique rows.

UPDATE item_rarities SET drop_rate_multiplier = 0.01 WHERE rarity_code = 'fabled';
ALTER TABLE item_rarities
    ALTER COLUMN drop_rate_multiplier TYPE DECIMAL(5,2);

DROP TABLE IF EXISTS unique_items;

DELETE FROM item_instances WHERE item_type = 'ring';
DELETE FROM item_templates WHERE item_type = 'ring';
DROP TABLE IF EXISTS rings;

ALTER TABLE item_instances DROP CONSTRAINT item_instances_item_type_check;
ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_item_type_check
        CHECK (item_type IN ('weapon', 'armor', 'consumable'));

ALTER TABLE item_templates DROP CONSTRAINT valid_item_type;
ALTER TABLE item_templates
    ADD CONSTRAINT valid_item_type
        CHECK (item_type IN ('weapon', 'armor', 'consumable'));

ALTER TABLE item_templates DROP COLUMN IF EXISTS min_item_level;
