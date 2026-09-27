-- Migration 020 down: restore the four space-era rarities from 000009.
-- Only the rarities: base items came from the seed script, not a migration.
-- !! The CASCADE deletes every item template, base item and item instance.

TRUNCATE item_templates, weapons, armors, consumables CASCADE;
TRUNCATE item_rarities CASCADE;

INSERT INTO item_rarities (id, rarity_code, rarity_name, color_hex, drop_rate_multiplier, sort_order) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', 'common',    'Common',    '#B0B0B0', 1.00, 1),
    ('660e8400-e29b-41d4-a716-446655440003', 'rare',      'Rare',      '#3498DB', 0.40, 2),
    ('660e8400-e29b-41d4-a716-446655440004', 'epic',      'Epic',      '#9B59B6', 0.15, 3),
    ('660e8400-e29b-41d4-a716-446655440005', 'legendary', 'Legendary', '#F39C12', 0.05, 4);
