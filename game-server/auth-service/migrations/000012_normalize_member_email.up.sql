-- FS-V6SFK §Requirements 6, 8. auth-service stores only the normalized email
-- (trimmed and lowercased), so "one account per email" means one per
-- normalized email and Me@x.com can never be a second account beside me@x.com.
--
-- Fail loudly, never merge. Two rows that collide once normalized are two
-- accounts a person has to reconcile by hand: picking a winner here would
-- silently delete someone's account. The check runs before the UPDATE so the
-- failure names the colliding addresses instead of surfacing as an opaque
-- members_email_key violation halfway through the rewrite. Only dev databases
-- exist today (FS-V6SFK), so naming the addresses in the error is acceptable.
--
-- The trim set is ASCII whitespace (space, \t, \n, \r, \f, \v as \x0B),
-- exactly the set auth-service trims in Go (member.emailTrimSet), so the
-- migration and the service normalize a stored address the same way.
DO $$
DECLARE
    collisions TEXT;
BEGIN
    SELECT string_agg(format('%s (%s rows)', normalized, n), ', ')
      INTO collisions
      FROM (
        SELECT lower(btrim(email, E' \t\n\r\f\x0B')) AS normalized, count(*) AS n
          FROM members
         GROUP BY 1
        HAVING count(*) > 1
      ) colliding;

    IF collisions IS NOT NULL THEN
        RAISE EXCEPTION 'FS-V6SFK: members.email collides once trimmed and lowercased, resolve the rows by hand, then run migrate force 11 (golang-migrate leaves version 12 dirty) and rerun: %', collisions;
    END IF;
END $$;

UPDATE members
   SET email = lower(btrim(email, E' \t\n\r\f\x0B'))
 WHERE email <> lower(btrim(email, E' \t\n\r\f\x0B'));

-- Uniqueness over the normalized form, so the database refuses a case variant
-- even if a future write path forgets to normalize. The original
-- members_email_key stays: it is now implied, and dropping it buys nothing.
CREATE UNIQUE INDEX members_email_lower_key ON members (lower(email));
