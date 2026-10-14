# ADR-0023 — One Postgres instance, with a database and a role per service

Status: accepted
Date: 2026-10-14
Scope: `game-server/docker-compose.yml`, `game-server/postgres/init.sql`, every service's DB connection settings
Related: ADR-0022 (service addresses from config), ADR-0011 (Temporal keeps its own instance)

## Context

Recorded without adversarial review.

Each of the ten database-owning services ran its own Postgres container, all under one shared
role (`user` / `password`). Database-per-service held only by convention: any service's
credentials could open any other service's database.

Production is GKE with Cloud SQL. Cloud SQL bills per instance, and ten instances cost roughly
ten times one, for a system with almost no traffic. One instance holding one database per service
is the posture worth paying for, and local development should rehearse the same shape.

## Decision

**One Postgres instance holds one database per service. Each service gets its own role, which
owns its database and nothing else.** `CONNECT` is revoked from `PUBLIC` on every database, so a
role cannot reach a database it does not own. Locally this is the `postgres` service in compose,
initialised by `postgres/init.sql`. In production it is one Cloud SQL instance with the same
databases and roles.

Owning the database, not merely holding `GRANT ALL` on it, is deliberate. In Postgres 15+ the
`public` schema belongs to the database owner, so ownership is what lets a service's migrations
create tables and trusted extensions such as `uuid-ossp`.

Temporal keeps its own instance (ADR-0011's settlement path): it migrates on its own cadence,
and sharing would let a Temporal schema upgrade take service databases down with it.

Rejected: **keeping one shared role.** That would be fewer credentials to manage, but
database-per-service would stay a convention instead of something Postgres enforces.

## Consequences

- **Isolation is enforced, not assumed.** A service that reads another's tables fails at
  connect time.
- **Cost scales with instances, not services.** Adding a service adds a database and a role,
  not an instance.
- **One failure domain.** The instance going down takes every service's data with it, and a
  noisy service's queries compete with everyone's for the same CPU, memory and
  `max_connections`. Every service must therefore cap its pool. Splitting a hot service out
  later is a connection-string change.
- **`init.sql` runs only on an empty volume.** A new service's database and role must also be
  created by hand on any existing instance, and in Cloud SQL.
- **Local passwords are development values in the repository.** Production supplies its own
  out of band.
