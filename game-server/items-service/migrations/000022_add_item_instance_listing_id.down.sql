DROP INDEX IF EXISTS item_instances_listing_id_key;

ALTER TABLE item_instances DROP COLUMN IF EXISTS listing_id;
