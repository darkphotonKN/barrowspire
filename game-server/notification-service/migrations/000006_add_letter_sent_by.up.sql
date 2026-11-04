-- Sent-by audit (FS-1GZGD A7.2, R53-R56): who sent each letter, for operators
-- reading the table; never shown to players. An official letter records the
-- admin's member id from the verified token, a system letter its sent-by
-- source (the requesting service or feature, or a letter trigger's name).
ALTER TABLE letters
    ADD COLUMN sent_by_member_id UUID NULL,
    ADD COLUMN sent_by_source    TEXT NULL;

-- NOT VALID (R54): every row inserted or updated from now on is checked;
-- letters stored before this migration keep both columns null and are not.
-- Nothing is backfilled or deleted.
ALTER TABLE letters
    ADD CONSTRAINT letters_sent_by_matches_sender CHECK (
        (sender = 'official' AND sent_by_member_id IS NOT NULL AND sent_by_source IS NULL)
        OR (sender = 'system' AND sent_by_source IS NOT NULL AND sent_by_member_id IS NULL)
    ) NOT VALID;
