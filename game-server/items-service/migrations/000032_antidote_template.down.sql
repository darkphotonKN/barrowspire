-- Migration 032 down: the antidote template and its consumable row.
--
-- !! DESTRUCTIVE: every antidote instance is deleted with it (an instance
-- !! needs its template); loadout slots that held one are nulled by
-- !! ON DELETE SET NULL.

DELETE FROM item_instances WHERE template_id = 'aa900000-0000-0000-0000-000000000001';
DELETE FROM item_templates WHERE id = 'aa900000-0000-0000-0000-000000000001';
DELETE FROM consumables WHERE id = '9a000000-0000-0000-0000-000000000001';
