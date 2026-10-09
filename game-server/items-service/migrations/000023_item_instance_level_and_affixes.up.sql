-- FS-4R9M9 R48: an owned instance keeps the level it dropped at, its rolled
-- affixes and its own derived required level. Existing rows read as item level
-- 1, no affixes and (required_level NULL) their template's required level.
ALTER TABLE item_instances
    ADD COLUMN item_level INT NOT NULL DEFAULT 1
        CONSTRAINT item_instances_item_level_check CHECK (item_level >= 1),
    ADD COLUMN affixes JSONB NOT NULL DEFAULT '[]'
        CONSTRAINT item_instances_affixes_check CHECK (jsonb_typeof(affixes) = 'array'),
    ADD COLUMN required_level INT NULL
        CONSTRAINT item_instances_required_level_check CHECK (required_level >= 1);
