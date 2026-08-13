# Load the .env file if it exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Construct the DB_STRING dynamically
DB_STRING=postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable

build:
	@go build -o bin/community-builds ./cmd/

run: build
	@./bin/community-builds

dev:
	@air

# Run tests with verbose output and coverage
test:
	@go test -v ./... -cover

# Run unit tests only (skip integration tests)
test-unit:
	@go test -v -short ./... -cover

# Run tests with coverage output and preview in a browser
test-preview:
	@go test ./filename/ -coverprofile=coverage.out 
	@go tool cover -html=coverage.out

# Migration commands using golang-migrate
migrate-up:
	@migrate -path migrations -database "$(DB_STRING)" up

migrate-down:
	@migrate -path migrations -database "$(DB_STRING)" down

migrate-status:
	@migrate -path migrations -database "$(DB_STRING)" version

migrate-down-to:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make migrate-down-to VERSION=<version>"; \
		exit 1; \
	fi; \
	migrate -path migrations -database "$(DB_STRING)" down $(VERSION)

# reset everything to a specific version
migrate-fix:
	@echo "Fixing dirty migration by setting version to $(version)..."
	$(MIGRATE_COMMAND) force $(version)


# drop ALL table
migrate-reset:
	@migrate -path migrations -database "$(DB_STRING)" drop

# Create new migration files
migrate-create:
	@if [ -z "$(NAME)" ]; then \
		echo "Usage: make migrate-create NAME=<migration_name>"; \
		exit 1; \
	fi; \
	migrate create -ext sql -dir migrations -seq $(NAME)

.PHONY: run dev test migrate-up migrate-down migrate-status migrate-down-to migrate-reset migrate-create









# ---------------------------------------------------------------------------
# SERIALIZED contract (OpenAPI 3.x) — plane 1 of the contract ADR.
#
# APPEND these targets to the edge service's existing Makefile. They are deliberately
# namespaced so they can coexist with a legacy annotation-generated doc pipeline; if the
# repo has one, keep its targets separate and do not merge the two.
#
# Command paths are declared in docs/agents/contract.md so generic skills can find them
# without hardcoding a toolchain. If you rename a target here, update that file.
#
# PLACEHOLDERS: openapi.yaml ../../game-client/src/api/generated ../.spectral.yaml ../.oasdiff-ignore
#               ./cmd/openapi ../contract-fixtures
# ---------------------------------------------------------------------------

OPENAPI_SPEC   = openapi.yaml
CLIENT_DIR     = ../../game-client/src/api/generated
SPECTRAL_RULES = ../.spectral.yaml
OASDIFF_IGNORE = ../.oasdiff-ignore
FIXTURES_DIR   = ../contract-fixtures

# oasdiff is PINNED and installed as a prebuilt binary rather than run via `go run`.
#
# Two reasons, both load-bearing:
#   1. `@latest` inside a gate is not reproducible — the gate can turn red on a day
#      nobody touched the contract.
#   2. oasdiff's own Go floor moves independently of yours. `go run` bridges the gap
#      silently by downloading a second toolchain, which makes the gate depend on a
#      network toolchain fetch and breaks under GOTOOLCHAIN=off.
#
# A pinned binary keeps the GATE's toolchain independent of the SERVICE's — which is also
# what lets repos on different language versions share this file unchanged.
OASDIFF_VERSION = 1.28.0
TOOLS_DIR       = .tools
OASDIFF         = $(TOOLS_DIR)/oasdiff

# ONE shell block, not one line per step. `make` runs each recipe LINE in its own shell,
# so a guard like `@if [ ! -f x ]; then echo SKIPPED; exit 0; fi` on its own line exits
# only THAT shell and lets the rest of the recipe proceed. That mistake produces
# silent-success gates — the exact failure these gates exist to prevent.
$(OASDIFF):
	@mkdir -p $(TOOLS_DIR)
	@set -e; \
	os=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
	case "$$os" in \
	  darwin) asset="darwin_all" ;; \
	  linux) \
	    case "$$(uname -m)" in \
	      aarch64|arm64) asset="linux_arm64" ;; \
	      *)             asset="linux_amd64" ;; \
	    esac ;; \
	  *) echo "❌ unsupported OS '$$os' — install oasdiff v$(OASDIFF_VERSION) into $(TOOLS_DIR)/ by hand"; exit 1 ;; \
	esac; \
	echo "installing oasdiff v$(OASDIFF_VERSION) ($$asset)..."; \
	curl -sSL "https://github.com/oasdiff/oasdiff/releases/download/v$(OASDIFF_VERSION)/oasdiff_$(OASDIFF_VERSION)_$$asset.tar.gz" \
	  | tar -xz -C $(TOOLS_DIR) oasdiff
	@$(OASDIFF) --version

# Regenerate the spec FROM the typed handler signatures. Types, not comments — this is
# what makes drift structurally impossible.
openapi:
	@if [ ! -d ./cmd/openapi ]; then \
		echo "SKIPPED: no ./cmd/openapi generator yet (expected until the first serialized endpoint)"; \
	else \
		go run ./cmd/openapi > $(OPENAPI_SPEC) && echo "✅ wrote $(OPENAPI_SPEC)"; \
	fi

# Regenerate the typed client FROM the committed spec. The generated client is the
# consumer's ONLY import path for serialized endpoints.
client:
	@if [ ! -f $(OPENAPI_SPEC) ]; then \
		echo "SKIPPED: $(OPENAPI_SPEC) does not exist yet (expected until the first serialized endpoint)"; \
	else \
		mkdir -p $(CLIENT_DIR) && \
		npx --yes openapi-typescript@7 $(OPENAPI_SPEC) -o $(CLIENT_DIR)/schema.d.ts && \
		echo "✅ wrote $(CLIENT_DIR)/schema.d.ts"; \
	fi

# Lint the spec for contract depth (descriptions, examples, error schemas).
lint-contract:
	@if [ ! -f $(OPENAPI_SPEC) ]; then \
		echo "SKIPPED: $(OPENAPI_SPEC) does not exist yet (expected until the first serialized endpoint)"; \
	else \
		npx --yes @stoplight/spectral-cli@6 lint --ruleset $(SPECTRAL_RULES) $(OPENAPI_SPEC); \
	fi

# Fail if the committed spec differs from the regenerated one. This is the gate that makes
# "committed spec" trustworthy rather than aspirational.
openapi-diff:
	@if [ ! -f $(OPENAPI_SPEC) ]; then \
		echo "SKIPPED: $(OPENAPI_SPEC) does not exist yet (expected until the first serialized endpoint)"; \
	else \
		cp $(OPENAPI_SPEC) /tmp/openapi.committed.yaml && \
		$(MAKE) --no-print-directory openapi && \
		{ diff -u /tmp/openapi.committed.yaml $(OPENAPI_SPEC) \
			|| { echo "❌ committed spec != regenerated — run 'make openapi' and commit"; exit 1; }; } && \
		echo "✅ committed spec matches regenerated"; \
	fi

# Breaking-change detection against the spec as committed on the base branch.
# Deliberate breaks pass ONLY via an entry in the allowlist with a stated reason.
#
# Reports SKIPPED with a reason until a baseline exists — a green check that means
# "nothing ran" is worse than no check, so the reason is always printed.
openapi-breaking: $(OASDIFF)
	@if [ ! -f $(OPENAPI_SPEC) ]; then \
		echo "SKIPPED: $(OPENAPI_SPEC) does not exist yet (expected until the first serialized endpoint)"; \
	elif ! git show origin/main:game-server/api-gateway/openapi.yaml > /tmp/openapi.base.yaml 2>/dev/null; then \
		rm -f /tmp/openapi.base.yaml; \
		echo "SKIPPED: no baseline spec on origin/main yet (first serialization)"; \
	else \
		$(OASDIFF) breaking /tmp/openapi.base.yaml $(OPENAPI_SPEC) \
			--err-ignore $(OASDIFF_IGNORE) --fail-on ERR; \
	fi

# Every plane-1 gate, in the order CI runs them.
gates: openapi-diff lint-contract openapi-breaking seam-gate seam-gate-selftest
	@echo "✅ contract gates complete"

# NOT PROVIDED (deliberate): a `gates-selftest` target that runs the fixtures and asserts
# their exit codes. The fixtures ship with manual commands in $(FIXTURES_DIR)/README.md,
# which verifies the gates at ADOPTION time but not continuously. Adding the target — and
# wiring it into CI — is the named next hardening step, left out here so this file matches
# what has actually been exercised rather than what would be nice.

.PHONY: openapi client lint-contract openapi-diff openapi-breaking gates

# --- FS-0001 seam gates (I-0007) -------------------------------------------
# Three checks, each guarding a failure that actually happened during FS-0001:
# a direct error write, a downstream message published to a client, and a `go`
# directive that moved inside an unrelated commit.
seam-gate:
	@cd .. && ./scripts/check-seam.sh

# Proves the gate above can still fail. Runs it against fixtures that violate
# every rule and asserts rc=1, then against the real tree and asserts rc=0.
seam-gate-selftest:
	@cd .. && ./scripts/seam-gate-selftest.sh
