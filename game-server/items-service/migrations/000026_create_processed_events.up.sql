-- FS-BVM9H Requirement 17. The consumer side of the transactional outbox: the
-- record of which events items-service has already applied, written in the same
-- transaction as the event's own writes (common/inbox). The code is shared; this
-- table lives in items' own database and no other service reads it.
--
-- The primary key is composite on purpose, so two event types that share an id
-- never mask each other.
CREATE TABLE processed_events (
    event_id     UUID NOT NULL,
    event_type   TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, event_type)
);
