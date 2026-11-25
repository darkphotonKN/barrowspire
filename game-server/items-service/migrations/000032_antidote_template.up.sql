-- FS-9JV5K §D R16: the antidote, a consumable that ends poison (FS-5FZ4J §D
-- R29) when drunk from the bag. No healing, no mana, stacks as the small heal
-- potion does. Added here, not by game-server/scripts/seed-dev.sh, so every
-- items database has it: game-service sells it from the wandering merchant and
-- keeps it out of the random loot pool, finding it by its name, "Antidote".
--
-- The spec's "common" is the lowest tier, `normal` since 000020 (FS-F8T3H),
-- named by its fixed id. Tradeable and droppable are no template columns since
-- 000008: an antidote is traded and dropped as any consumable is. Its own ids
-- are fixed too, so the down can name them.

INSERT INTO consumables (id, rarity_id, healing_amount, mana_amount, buff_duration, max_stack_size, description) VALUES
    ('9a000000-0000-0000-0000-000000000001', 'f8700000-0000-0000-0000-000000000001', 0, 0, 0, 20,
     'A stoppered vial of bitter green draught that burns the venom out.');

INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, icon_url, required_level, min_item_level) VALUES
    ('aa900000-0000-0000-0000-000000000001', 'Antidote', 'f8700000-0000-0000-0000-000000000001', 'consumable',
     '9a000000-0000-0000-0000-000000000001', '/icons/consumable/antidote.png', 1, 1);
