-- Drops the column and, with it, the UNIQUE constraint Postgres created for it.
ALTER TABLE members DROP COLUMN IF EXISTS account_id;
