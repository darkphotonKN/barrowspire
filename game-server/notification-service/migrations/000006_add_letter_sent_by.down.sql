ALTER TABLE letters DROP CONSTRAINT IF EXISTS letters_sent_by_matches_sender;
ALTER TABLE letters
    DROP COLUMN IF EXISTS sent_by_source,
    DROP COLUMN IF EXISTS sent_by_member_id;
