# How to run the database tests

Some tests in `game-server` need a real Postgres: row locks, `SKIP LOCKED`, migrations, constraint
checks. They are **opt-in**. Each one reads a DSN from an environment variable, and a plain
`go test ./...` without that variable **skips** them (one exception, below). So they never run by
accident, and they are easy to forget. This page says how to run them.

---

## The one rule

**Never point a test DSN at a dev database** (`barrowspire_<service>_service_db`). Some of these
tests build a scratch schema, some migrate the database up and down, and some commit rows and
leave them there. Point them at a throwaway database you create for the run and drop afterwards.

---

## The quick way: `common`

```bash
cd game-server/common
make test-db
```

This runs the `common/outbox` and `common/inbox` database tests under `-race`. It:

1. reads the user, password and port from the running `barrowspire-postgres` container (nothing
   is hard-coded);
2. creates a throwaway database named `barrowspire_common_dbtest_<time>_<pid>`;
3. runs the tests with `OUTBOX_TEST_DB_DSN` and `INBOX_TEST_DB_DSN` pointed at it;
4. drops it afterwards, **even when a test fails**, and prints how many are left (0).

It needs the compose stack's Postgres running. Use `PG_CONTAINER=<name>` for another container.

---

## A throwaway database by hand

The services have no `make test-db` yet. Make a throwaway database yourself. The local
superuser is set in `game-server/docker-compose.yml`:

```bash
docker exec barrowspire-postgres psql -U postgres -d postgres -c "CREATE DATABASE barrowspire_dbtest"
export DSN='postgres://postgres:<password>@localhost:5432/barrowspire_dbtest?sslmode=disable'
# … run the tests below …
docker exec barrowspire-postgres psql -U postgres -d postgres -c "DROP DATABASE barrowspire_dbtest WITH (FORCE)"
```

Keep `?sslmode=disable` in the DSN. Some helpers append `&search_path=…` to it, which needs a query
string already there.

---

## Every opt-in variable

"Empty" means the test builds what it needs inside a scratch schema, so a freshly created database
is enough. "Migrated" means the test expects the service's tables to exist already, so run that
service's migrations on the throwaway database first (`migrate -path <service>/migrations
-database "$DSN" up`).

| Variable | Package(s) | Needs | What the tests do to the database |
|---|---|---|---|
| `OUTBOX_TEST_DB_DSN` | `common/outbox` | empty | one schema per test (`outbox_relay_test_<random>`) holding an `outbox` table; dropped after |
| `INBOX_TEST_DB_DSN` | `common/inbox` | empty | schema `inbox_repository_test` holding `processed_events`; dropped after |
| `ITEMS_TEST_DSN` | `items-service/internal/items` | **migrated** items DB | most tests run in one rolled-back transaction; a few lock and relist tests **commit** rows under fresh ids and do not delete them |
| `MARKETPLACE_TEST_DB_DSN` | `marketplace-service/internal/listing/...` | empty | a scratch schema per test, built from `migrations/*.up.sql`; dropped after |
| `NOTIFICATION_TEST_DB_DSN` | `notification-service/internal/notification`, `.../mailbox` | empty | a scratch schema built from the migrations (`public` stays on the path for `uuid-ossp`); dropped after |
| `CHARACTER_TEST_DSN` | `character-service/internal/character` | **migrated** character DB | commits rows and deletes them by the test's own member ids; `TestNameCheckMigration_UpDownUp` **migrates the database itself** down to 000002 and back up |
| `WALLET_TEST_DB_DSN` | `wallet-service/internal/account/query` (stale holds) | empty | a scratch schema built from `migrations/*.up.sql`; dropped after |
| `LEDGER_TEST_DB_DSN` | `ledger-service/internal/ledger/repository` | empty | a scratch schema built from the migrations; dropped after. **Not opt-in, see below** |
| `STATS_TEST_DB_DSN` | `stats-service/internal/stats` | empty | a scratch schema per test (`tvczq_<random>`) built from the real up files; dropped after. Installs `uuid-ossp` in `public` if missing |

Example commands, run from `game-server/`, with `$DSN` from the section above:

```bash
(cd common               && OUTBOX_TEST_DB_DSN="$DSN" INBOX_TEST_DB_DSN="$DSN" go test -race -count=1 ./outbox/ ./inbox/)
(cd items-service        && ITEMS_TEST_DSN="$DSN"           go test -count=1 ./internal/items/)       # migrate first
(cd marketplace-service  && MARKETPLACE_TEST_DB_DSN="$DSN"  go test -count=1 ./internal/listing/...)
(cd notification-service && NOTIFICATION_TEST_DB_DSN="$DSN" go test -count=1 ./internal/...)
(cd character-service    && CHARACTER_TEST_DSN="$DSN"       go test -count=1 ./internal/character/)  # migrate first
(cd wallet-service       && WALLET_TEST_DB_DSN="$DSN"       go test -count=1 ./internal/account/query/)
(cd ledger-service       && LEDGER_TEST_DB_DSN="$DSN"       go test -count=1 ./internal/ledger/repository/)
(cd stats-service        && STATS_TEST_DB_DSN="$DSN"        go test -count=1 ./internal/stats/)
```

Without its variable, each of these packages still passes `go test ./...`: the database tests
report `SKIP` with a line naming the variable to set. `go test -short` skips them too.

---

## Exceptions to watch

- **`ledger-service` is not opt-in.** With `LEDGER_TEST_DB_DSN` unset, `ledger_rows_test.go` falls
  back to the ledger **dev** database (`barrowspire_ledger_service_db` on `localhost:5432`, as the
  `ledger_service` user) and creates and drops a scratch schema inside it. It never touches the
  ledger's own tables, but it does run there. Set `LEDGER_TEST_DB_DSN` to a throwaway database, or
  use `-short`, if that matters.
- **Older tests read `DB_HOST` / `DB_PORT` / `DB_NAME`** instead of a test variable: auth
  (`config/migrations_test.go`, `internal/member/account_recorder_test.go`) and wallet
  (`internal/account/repository`, `query/expired_holds_query_test.go`,
  `usecase/create_account_on_signup_usecase_test.go`). They default to ports 5216 and 5225, which
  nothing listens on any more, so they skip. **Do not export `DB_*` pointing at a dev database in the
  shell you run tests from**: these tests would then run against it, and some of them insert and
  delete rows.
