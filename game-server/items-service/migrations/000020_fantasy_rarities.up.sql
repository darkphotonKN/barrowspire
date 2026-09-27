-- Migration 020: Fantasy rarity tiers; purge the space-era catalogue (FS-F8T3H R1-R2)
--
-- !! DESTRUCTIVE: the CASCADE below also deletes EVERY row in item_instances
-- !! (they reference item_templates / item_rarities) and nulls every
-- !! player_loadouts slot that pointed at one. Intended for dev.
--
-- Base items are not migrated any more: game-server/scripts/seed-dev.sh
-- creates them through the complete-* endpoints at the `normal` rarity.

TRUNCATE item_templates, weapons, armors, consumables CASCADE;
TRUNCATE item_rarities CASCADE;

-- Fixed ids so the seed script and tests can name a tier without a lookup.
INSERT INTO item_rarities (id, rarity_code, rarity_name, color_hex, drop_rate_multiplier, sort_order) VALUES
    ('f8700000-0000-0000-0000-000000000001', 'normal',   'Normal',   '#BFB6A3', 1.00, 1),
    ('f8700000-0000-0000-0000-000000000002', 'uncommon', 'Uncommon', '#6B8E3A', 0.40, 2),
    ('f8700000-0000-0000-0000-000000000003', 'rare',     'Rare',     '#3E6A9A', 0.15, 3),
    ('f8700000-0000-0000-0000-000000000004', 'runed',    'Runed',    '#B8732E', 0.05, 4),
    ('f8700000-0000-0000-0000-000000000005', 'fabled',   'Fabled',   '#9E2A2B', 0.01, 5);
