-- Drops the case-insensitive uniqueness only. The lowercasing is not undone:
-- the original casing is gone, and a lowercased email is still a valid one.
DROP INDEX IF EXISTS members_email_lower_key;
