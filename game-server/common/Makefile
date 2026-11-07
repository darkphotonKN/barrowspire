gen:
	@protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
		api/proto/common/common.proto \
		api/proto/auth/auth.proto \
		api/proto/game/game.proto \
		api/proto/stats/stats.proto \
		api/proto/items/items.proto \
		api/proto/payment/payment.proto \
		api/proto/wallet/wallet.proto \
		api/proto/ledger/ledger.proto \
		api/proto/marketplace/marketplace.proto \
		api/proto/notification/notification.proto \
		api/proto/character/character.proto \
		api/proto/events/game.proto \
		api/proto/events/item.proto \
		api/proto/events/marketplace.proto \
		api/proto/events/mailbox.proto \
		api/proto/shared/v1/pagination.proto


# --- DB tests (docs/db-tests-guide.md) ---
# Runs the opt-in common/outbox and common/inbox database tests against a
# throwaway database on the local docker postgres, then drops it, pass or fail.
# The user, password and port are read from the running container at run time,
# so no secret lives here. The database is always a fresh
# barrowspire_common_dbtest_* one, never a service's dev database.
PG_CONTAINER ?= barrowspire-postgres

.PHONY: test-db
test-db:
	@set -eu; \
	user=$$(docker exec $(PG_CONTAINER) printenv POSTGRES_USER); \
	pass=$$(docker exec $(PG_CONTAINER) printenv POSTGRES_PASSWORD); \
	port=$$(docker port $(PG_CONTAINER) 5432/tcp | head -n1 | sed 's/.*://'); \
	db="barrowspire_common_dbtest_$$(date +%s)_$$$$"; \
	case "$$db" in *_service_db|postgres|template*) echo "refusing to use $$db"; exit 1;; esac; \
	admin() { docker exec $(PG_CONTAINER) psql -v ON_ERROR_STOP=1 -qAt -U "$$user" -d postgres -c "$$1"; }; \
	drop() { echo ">> dropping $$db"; admin "DROP DATABASE IF EXISTS $$db WITH (FORCE)"; \
		echo ">> throwaway databases left: $$(admin "SELECT count(*) FROM pg_database WHERE datname = '$$db'")"; }; \
	echo ">> creating throwaway database $$db on $(PG_CONTAINER), localhost:$$port"; \
	admin "CREATE DATABASE $$db"; \
	trap drop EXIT; \
	dsn="postgres://$$user:$$pass@localhost:$$port/$$db?sslmode=disable"; \
	echo ">> go test -race -count=1 ./outbox/ ./inbox/ with OUTBOX_TEST_DB_DSN and INBOX_TEST_DB_DSN on $$db"; \
	OUTBOX_TEST_DB_DSN="$$dsn" INBOX_TEST_DB_DSN="$$dsn" go test -race -count=1 -v ./outbox/ ./inbox/
