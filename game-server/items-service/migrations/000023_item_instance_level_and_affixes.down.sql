ALTER TABLE item_instances
    DROP COLUMN IF EXISTS required_level,
    DROP COLUMN IF EXISTS affixes,
    DROP COLUMN IF EXISTS item_level;
