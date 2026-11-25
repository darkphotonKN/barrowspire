-- FS-9JV5K §Change: The Restoring Draught D1: a consumable that refills half
-- the drinker's class resource (stamina, mana or parry charges) when drunk from
-- the bag. No healing, no mana amount of its own, stacks as the antidote does.
-- Added here, not by game-server/scripts/seed-dev.sh, so every items database
-- has it: game-service sells it from the wandering merchant and keeps it out of
-- the random loot pool, finding it by its name, "Restoring Draught".
--
-- "Common" is `normal` since 000020 (FS-F8T3H), named by its fixed id, as in
-- 000032. Its own ids are fixed too, so the down can name them.

INSERT INTO consumables (id, rarity_id, healing_amount, mana_amount, buff_duration, max_stack_size, description) VALUES
    ('9a000000-0000-0000-0000-000000000002', 'f8700000-0000-0000-0000-000000000001', 0, 0, 0, 20,
     'A corked flask of clear, cold draught that puts the strength back in tired limbs.');

INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, icon_url, required_level, min_item_level) VALUES
    ('aa900000-0000-0000-0000-000000000002', 'Restoring Draught', 'f8700000-0000-0000-0000-000000000001', 'consumable',
     '9a000000-0000-0000-0000-000000000002', '/icons/consumable/restoring_draught.png', 1, 1);
