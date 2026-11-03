package config

import (
	"fmt"
	"log"
	"log/slog"
	"os"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/constants"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commontracing "github.com/darkphotonKN/barrowspire-server/common/tracing"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jmoiron/sqlx"

	// Importing for side effects - Dont Remove
	// This IS being used!
	_ "github.com/lib/pq"
)

/**
* Sets up the Database connection and provides its access as a singleton to
* the entire application.
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

	// pass the db connection string to connect to our database
	// queries show up as spans under the request that ran them
	db, err := commontracing.OpenPostgres(dsn)
	if err != nil {
		log.Fatalf("Failed to connect to the database: %v", err)
	}

	// small pool: Cloud SQL db-f1-micro allows 25 connections for every service and replica combined
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	slog.Info("Connected to the database successfully")

	// Run migrations
	if err := runMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	return db
}

func runMigrations(db *sqlx.DB) error {
	driver, err := postgres.WithInstance(db.DB, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("could not create migration driver: %v", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"postgres",
		driver,
	)
	if err != nil {
		return fmt.Errorf("could not create migration instance: %v", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("could not run migrations: %v", err)
	}

	slog.Info("Successfully ran all migrations")
	return nil
}

// SeedDefaults takes the caller's password policy rather than building its
// own: the embedded list is a 100k-entry map, built once in main. The seed
// never checks it (seeded passwords are not set by a member), but the
// service needs one.
func SeedDefaults(db *sqlx.DB, passwordPolicy member.PasswordPolicy) {
	// --- default members ---
	memberRepo := member.NewRepository(db)
	outboxRepo := commonoutbox.NewRepo(db)
	outboxService := commonoutbox.NewService(outboxRepo)
	codeIssuer := member.NewCodeIssuer(memberRepo, outboxService, time.Now)
	verifier := member.NewVerifier(member.NewTransactor(db), memberRepo, codeIssuer, time.Now)
	memberService := member.NewService(db, memberRepo, nil, outboxService, passwordPolicy, codeIssuer, verifier)

	err := memberService.CreateDefaultMembers(constants.DefaultMembers)

	if err != nil {
		log.Fatal("Error when attempting to create default members:", err)
	}

	slog.Info("Successfully created all default members")

}
