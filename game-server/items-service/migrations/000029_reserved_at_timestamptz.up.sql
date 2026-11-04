-- reserved_at was added in 000018, after 000015 moved every other column to
-- TIMESTAMPTZ, so it stayed a naive TIMESTAMP. The reservation reconciler now
-- stamps and measures it with NOW() on the database clock, which is correct
-- either way; this brings the column in line with the rest of the table.
-- Existing naive values are read as UTC, the same rule 000015 used.
ALTER TABLE item_instances
  ALTER COLUMN reserved_at TYPE TIMESTAMPTZ USING reserved_at AT TIME ZONE 'UTC';
