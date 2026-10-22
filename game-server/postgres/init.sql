-- One database and one role per service on a single Postgres instance (ADR-0023)
--
-- Runs once, as the superuser, only when the data volume is empty. Editing this
-- file does nothing to an existing volume.
--
-- Each role OWNS its database: in Postgres 15+ the public schema belongs to the
-- database owner, so owning the database is what lets migrations create tables
-- (GRANT ALL ON DATABASE alone does not). Revoking CONNECT from PUBLIC is what
-- keeps every other role out.
--
-- Passwords are local development values. Production supplies its own.

CREATE ROLE auth_service         LOGIN PASSWORD 'auth_service';
CREATE ROLE character_service    LOGIN PASSWORD 'character_service';
CREATE ROLE game_service         LOGIN PASSWORD 'game_service';
CREATE ROLE items_service        LOGIN PASSWORD 'items_service';
CREATE ROLE ledger_service       LOGIN PASSWORD 'ledger_service';
CREATE ROLE marketplace_service  LOGIN PASSWORD 'marketplace_service';
CREATE ROLE notification_service LOGIN PASSWORD 'notification_service';
CREATE ROLE payment_service      LOGIN PASSWORD 'payment_service';
CREATE ROLE stats_service        LOGIN PASSWORD 'stats_service';
CREATE ROLE wallet_service       LOGIN PASSWORD 'wallet_service';

CREATE DATABASE barrowspire_auth_service_db         OWNER auth_service;
CREATE DATABASE barrowspire_character_service_db    OWNER character_service;
CREATE DATABASE barrowspire_game_service_db         OWNER game_service;
CREATE DATABASE barrowspire_items_service_db        OWNER items_service;
CREATE DATABASE barrowspire_ledger_service_db       OWNER ledger_service;
CREATE DATABASE barrowspire_marketplace_service_db  OWNER marketplace_service;
CREATE DATABASE barrowspire_notification_service_db OWNER notification_service;
CREATE DATABASE barrowspire_payment_service_db      OWNER payment_service;
CREATE DATABASE barrowspire_stats_service_db        OWNER stats_service;
CREATE DATABASE barrowspire_wallet_service_db       OWNER wallet_service;

REVOKE ALL ON DATABASE barrowspire_auth_service_db         FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_character_service_db    FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_game_service_db         FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_items_service_db        FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_ledger_service_db       FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_marketplace_service_db  FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_notification_service_db FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_payment_service_db      FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_stats_service_db        FROM PUBLIC;
REVOKE ALL ON DATABASE barrowspire_wallet_service_db       FROM PUBLIC;

GRANT ALL ON DATABASE barrowspire_auth_service_db         TO auth_service;
GRANT ALL ON DATABASE barrowspire_character_service_db    TO character_service;
GRANT ALL ON DATABASE barrowspire_game_service_db         TO game_service;
GRANT ALL ON DATABASE barrowspire_items_service_db        TO items_service;
GRANT ALL ON DATABASE barrowspire_ledger_service_db       TO ledger_service;
GRANT ALL ON DATABASE barrowspire_marketplace_service_db  TO marketplace_service;
GRANT ALL ON DATABASE barrowspire_notification_service_db TO notification_service;
GRANT ALL ON DATABASE barrowspire_payment_service_db      TO payment_service;
GRANT ALL ON DATABASE barrowspire_stats_service_db        TO stats_service;
GRANT ALL ON DATABASE barrowspire_wallet_service_db       TO wallet_service;
