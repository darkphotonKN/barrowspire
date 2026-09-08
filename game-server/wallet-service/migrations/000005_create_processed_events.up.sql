-- FS-0006 §Requirements 20-21. The consumer side of the transactional outbox
-- pattern: the record of which events this service has already acted on.
--
-- The CODE is shared (common/inbox); the STORAGE is not. This table lives in
-- wallet's own database and no other service reads it.
--
-- The primary key is composite on purpose. Keying on event_id alone would let
-- one event type mask another that happened to share an id — this service will
-- consume more than one event type over its life.
CREATE TABLE processed_events (
    event_id     UUID NOT NULL,
    event_type   TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, event_type)
);
