# SPECIFICATION — notification-service

<!-- Thin capability index: one line per capability, grouped by bounded context.
     Format authority: /docs/specs/README.md — capability names only, no design detail;
     sections are bounded contexts, never status; status is the checkbox ([x] shipped, [ ] not).
     Populate with /spec-bootstrap (from existing code) or /scope-it (for new work).
     Deep feature specs live in the root docs/specs/ as FS-NNNN. -->

## notification-service

## Notifications

- [x] Match-result notifications → FS-none
- [x] Deduplicated match-result notifications → FS-PJPNA
- [ ] Verification-code email → FS-V6SFK
- [ ] Outbound email delivery behind a mailer → FS-V6SFK

## Mailbox

- [ ] Official and system letters to one member or to every member → FS-1GZGD
- [ ] Letter requests from the broker, deduplicated → FS-1GZGD
- [ ] A member's mailbox and its summary → FS-1GZGD
- [ ] Claim a letter's enclosures → FS-1GZGD
- [ ] New-letter arrival published to the game pods → FS-1GZGD
