-- FS-9KW9F §Requirements 16, 20-21. auth-service's inbox: which events it has
-- already acted on, so a redelivery is recognised rather than applied twice.
--
-- The CODE is shared (common/inbox); the STORAGE is not. This table lives in
-- auth's own database and no other service reads it.
--
-- Composite primary key on purpose: keying on event_id alone would let one
-- event type mask another that happened to share an id.
CREATE TABLE processed_events (
    event_id     UUID NOT NULL,
    event_type   TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, event_type)
);
