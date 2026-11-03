# ADR-0041: Password policy is length plus a blocklist, checked only when a password is set

Status: accepted
Date: 2026-11-03
Scope: `game-server/auth-service`, `game-client`
Realized by: [FS-V6SFK](../specs/V6SFK-signup-hardening.md)

## Context

Signup accepted any password the client let through, and the client checked only for 6
characters. The user asked for safer passwords and first proposed composition rules: lowercase
plus numbers, minimum 8.

NIST SP 800-63B advises against composition rules. They push people to predictable shapes
(`Password1`, `Summer2026!`) without adding much entropy, and they make passwords harder to
remember. Its recommendation is a length floor, a generous ceiling, and screening against
known-common or breached passwords.

auth-service hashes with bcrypt, which reads only the first 72 bytes. Newer `x/crypto` versions
reject longer input outright.

Existing members chose passwords under the old rule. Login compares against the stored hash, so
it doesn't need to know what policy a password was chosen under.

Recorded without adversarial review: the user accepted it during scoping and skipped
challenge-me.

## Decision

- A password must be **at least 10 characters and at most 72 bytes**, and must **not be on an
  embedded common-password list** (compared case-insensitively). There are **no
  character-class rules.**
- auth-service is the one place the rule lives. It runs **whenever a password is set**: at
  signup and at password change.
- **Login never applies the policy.** Existing hashes are never touched, migrated, flagged or
  force-reset.
- The client mirrors only the length rule and shows auth's reason for anything else. The
  blocklist never ships to the client.
- The blocklist is a file bundled with the service. No breach-corpus API is called in v1.

## Consequences

- Members with old weak passwords keep them until they choose to change. The policy only
  hardens new passwords.
- The 72-byte ceiling is a bcrypt fact, not a preference. Changing the hash algorithm would
  lift it.
- A bundled list goes stale and can't catch new breaches. Adding a breach API (k-anonymity
  range queries) later is additive and doesn't supersede this ADR.
- Anyone who asks "why don't we require numbers?" gets this ADR as the answer.
