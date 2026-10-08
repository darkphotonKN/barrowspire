-- Migration 024: base tiers, the ring item type, the unique catalogue and the
-- Fabled reweight (FS-4R9M9 R1, R5-R7).
--
-- !! NOT REVERSIBLE: every existing `fabled` instance is relabelled `runed`
-- !! (stats and names untouched). Fabled now means a unique, never a random
-- !! tier. The down migration restores the column type and the 0.01 weight
-- !! but leaves the relabelled instances Runed.

-- R1: the lowest item level a template can drop at; existing bases are tier I.
ALTER TABLE item_templates
    ADD COLUMN min_item_level INT NOT NULL DEFAULT 1
        CONSTRAINT item_templates_min_item_level_check CHECK (min_item_level >= 1);

-- R5: `ring` is a fourth item type wherever item_type is constrained.
-- item_instances_armor_slot_check already demands a NULL slot for non-armor.
ALTER TABLE item_templates DROP CONSTRAINT valid_item_type;
ALTER TABLE item_templates
    ADD CONSTRAINT valid_item_type
        CHECK (item_type IN ('weapon', 'armor', 'consumable', 'ring'));

ALTER TABLE item_instances DROP CONSTRAINT item_instances_item_type_check;
ALTER TABLE item_instances
    ADD CONSTRAINT item_instances_item_type_check
        CHECK (item_type IN ('weapon', 'armor', 'consumable', 'ring'));

-- A ring has no base stats (its power is its affixes), so its row only gives
-- a ring template the item_id it points at.
CREATE TABLE rings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rarity_id   UUID NOT NULL REFERENCES item_rarities(id),
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by  UUID,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by  UUID
);

CREATE INDEX idx_rings_rarity ON rings(rarity_id);

CREATE TRIGGER rings_updated_at
    BEFORE UPDATE ON rings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- R6: a unique is a `fabled` template plus this row. Effect codes are the
-- closed set of R31; fixed affixes are [{stat, min, max}].
CREATE TABLE unique_items (
    template_id   UUID PRIMARY KEY REFERENCES item_templates(id),
    effect_code   TEXT NOT NULL
        CONSTRAINT unique_items_effect_code_check
        CHECK (effect_code IN ('kill_frenzy', 'melee_reflect', 'pierce', 'kill_heal', 'burning_dash', 'floor_attributes')),
    effect_text   TEXT NOT NULL,
    fixed_affixes JSONB NOT NULL DEFAULT '[]'
        CONSTRAINT unique_items_fixed_affixes_check CHECK (jsonb_typeof(fixed_affixes) = 'array'),
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by    UUID,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by    UUID
);

CREATE TRIGGER unique_items_updated_at
    BEFORE UPDATE ON unique_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- R7: widen so a weight below 0.01 fits, then reweight Fabled (others keep
-- 1.00 / 0.40 / 0.15 / 0.05). The Fabled weight is this one literal.
ALTER TABLE item_rarities
    ALTER COLUMN drop_rate_multiplier TYPE NUMERIC(6,4);

UPDATE item_rarities SET drop_rate_multiplier = 0.005 WHERE rarity_code = 'fabled';

-- R7: no random Fabled any more; existing ones become Runed, stats untouched.
-- An instance of a Fabled template is a unique (it survives a down -> up
-- cycle, since the down keeps unique templates) and stays Fabled.
UPDATE item_instances
   SET rarity_id = (SELECT id FROM item_rarities WHERE rarity_code = 'runed')
 WHERE rarity_id = (SELECT id FROM item_rarities WHERE rarity_code = 'fabled')
   AND template_id NOT IN (
       SELECT id FROM item_templates
        WHERE rarity_id = (SELECT id FROM item_rarities WHERE rarity_code = 'fabled'));
