# Variables
MIGRATIONS_PATH = ./migrations

# Load the .env file if it exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Construct the DB_STRING dynamically
DB_STRING=postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable
MIGRATE_COMMAND = migrate -path $(MIGRATIONS_PATH) -database "postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable"

dev:
	@air

build:
	go build -o bin/payment-service cmd/server/main.go

run:
	go run cmd/server/main.go

test:
	@go test -v ./... -cover

test-unit:
	@go test -v -short ./... -cover

# Migration commands using golang-migrate
migrate-up:
	@migrate -path ./migrations -database "$(DB_STRING)" up

migrate-down:
	@migrate -path ./migrations -database "$(DB_STRING)" down

migrate-status:
	@migrate -path ./migrations -database "$(DB_STRING)" version

migrate-fix:
	@echo "Fixing dirty migration by setting version to $(version)..."
	$(MIGRATE_COMMAND) force $(version)

migrate-down-to:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make migrate-down-to VERSION=<version>"; \
		exit 1; \
	fi; \
	migrate -path ./migrations -database "$(DB_STRING)" down $(VERSION)

migrate-reset:
	@migrate -path ./migrations -database "$(DB_STRING)" drop -f
	@migrate -path ./migrations -database "$(DB_STRING)" up

migrate-create:
	@if [ -z "$(NAME)" ]; then \
		echo "Usage: make migrate-create NAME=<migration_name>"; \
		exit 1; \
	fi; \
	migrate create -ext sql -dir ./migrations -seq $(NAME)

.PHONY: dev build run test test-unit migrate-up migrate-down migrate-status migrate-fix migrate-down-to migrate-reset migrate-create
