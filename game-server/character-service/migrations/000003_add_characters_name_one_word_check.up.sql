-- A character's name is one word, so a whisper's "@Name message" always finds
-- the whole name (FS-KCQ06 §Requirements 19). Validated when added: a row that
-- already holds whitespace fails this migration on purpose. Rename that row and
-- re-run; never weaken this to NOT VALID. [[:space:]] follows the database's
-- ctype and may miss the ideographic space (U+3000) under a C locale, so that
-- one is tested explicitly.
ALTER TABLE characters
    ADD CONSTRAINT characters_name_one_word
    CHECK (name !~ '[[:space:]]' AND strpos(name, U&'\3000') = 0);
