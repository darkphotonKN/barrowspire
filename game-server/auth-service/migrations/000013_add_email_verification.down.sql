DROP TABLE IF EXISTS verification_codes;
ALTER TABLE members DROP COLUMN IF EXISTS email_verified_at;
