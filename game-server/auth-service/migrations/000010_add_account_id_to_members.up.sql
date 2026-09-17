-- FS-9KW9F §Requirements 9. A CACHE of wallet.accounts.id, never a source of truth.
--
-- NULL is the whole design, not a concession: the value is populated eventually
-- by the account.created consumer, so "not known yet" is a normal, long-lived
-- state. Every consumer of the resulting token claim fails closed on its
-- absence (ADR-0014), which is what makes the staleness safe.
--
-- UNIQUE mirrors wallet.accounts.member_id UNIQUE, so a buggy consumer cannot
-- write one account id onto two members — that would have two people silently
-- sharing one account's history. Postgres permits many NULLs under a UNIQUE
-- constraint, so this does not constrain the un-populated majority (which,
-- today, is every member that exists).
--
-- Deliberately NO foreign key: wallet.accounts lives in another service's
-- database. This is a soft reference across a service boundary.
ALTER TABLE members ADD COLUMN account_id UUID NULL UNIQUE;

COMMENT ON COLUMN members.account_id IS
  'Cache of wallet.accounts.id, populated asynchronously by the account.created consumer. NULL means not known yet; consumers fail closed. See FS-9KW9F and ADR-0014.';
