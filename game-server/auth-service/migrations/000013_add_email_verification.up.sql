-- FS-V6SFK §Requirements 10-11, ADR-0043. Soft email verification.
--
-- email_verified_at: set means verified. Added NULL with no default, so every
-- existing member, the admin seed included, starts unverified: none of them
-- ever proved they receive mail at their address.
ALTER TABLE members ADD COLUMN email_verified_at TIMESTAMPTZ NULL;

-- At most one live code per member, so member_id is the primary key and
-- issuing a code upserts it: a new code always kills the old one. Only the
-- SHA-256 of member id + code is stored, never the code. The row goes with
-- its member and on success. A code burned by its 5th wrong entry, or past
-- expires_at, is dead but keeps its row: issued_at must survive so the resend
-- cooldown still holds, and a dead row verifies nothing until a new code
-- replaces it.
CREATE TABLE verification_codes (
    member_id      UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    code_hash      BYTEA NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    issued_at      TIMESTAMPTZ NOT NULL
);
