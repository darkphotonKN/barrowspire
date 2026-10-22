-- FS-BVM9H §Requirement 17. The consumer side of the transactional outbox
-- pattern: the record of which events this service has already applied, so a
-- redelivered match.ended is recognised rather than counted twice.
--
-- The CODE is shared (common/inbox); the STORAGE is not. This table lives in
-- stats' own database and no other service reads it (ADR-0023).
--
-- The primary key is composite on purpose: keying on event_id alone would let
-- one event type mask another that happened to share an id.
CREATE TABLE processed_events (
    event_id     UUID NOT NULL,
    event_type   TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, event_type)
);
