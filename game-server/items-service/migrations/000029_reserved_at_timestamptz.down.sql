ALTER TABLE item_instances
  ALTER COLUMN reserved_at TYPE TIMESTAMP USING reserved_at AT TIME ZONE 'UTC';
