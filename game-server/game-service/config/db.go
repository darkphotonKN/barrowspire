package config

import (
	"fmt"
	"log"
	"log/slog"
	"os"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jmoiron/sqlx"

	// Importing for side effects - Dont Remove
	// This IS being used!
	_ "github.com/lib/pq"
)

/**
* Connects to game-service's own database (DB_* env) and runs its migrations
* before returning. A migration failure aborts startup: game-service must not
* accept runs whose results it cannot record in its outbox.
**/
func InitDB() *sqlx.DB {
	// construct the db connection string
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=disable",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)

	// never log the dsn: it carries the user and password
	slog.Info("Connecting to database",
		"host", os.Getenv("DB_HOST"),
		"port", os.Getenv("DB_PORT"),
		"db_name", os.Getenv("DB_NAME"),
	)

	// pass the db connection string to connect to our database
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to the database: %v", err)
	}

	// small pool: Cloud SQL db-f1-micro allows 25 connections for every service and replica combined
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	fmt.Printf("\nConnected to the database successfully.\n\n")

	if err := runMigrations(db); err != nil {
		slog.Error("Failed to run database migrations", "error", err)
		os.Exit(1)
	}

	return db
}

func runMigrations(db *sqlx.DB) error {
	driver, err := postgres.WithInstance(db.DB, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("could not create migration driver: %w", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"postgres",
		driver,
	)
	if err != nil {
		return fmt.Errorf("could not create migration instance: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("could not run migrations: %w", err)
	}

	fmt.Printf("Successfully ran all migrations.\n\n")
	return nil
}
