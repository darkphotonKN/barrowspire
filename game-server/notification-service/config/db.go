package config

import (
	"database/sql"
	"fmt"
	"log"
	"log/slog"
	"os"
	"strconv"
	"time"

	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
)

// The pool budget (FS-1GZGD, ADR-0044 §Consequences). Most services keep two
// connections, since Cloud SQL db-f1-micro allows 25 for every service and
// replica combined. notification cannot: a claim holds a connection inside its
// transaction across the items grant and the wallet credit, up to 10 s, and a
// letter request or a cold-cache welcome holds one across its items resolve,
// up to 5 s. With two connections, two slow claims froze every read, mark
// read, GetNotification and consumer. So notification keeps eight: at most
// MaxConcurrentClaims claims (the mailbox answers the next one busy at once)
// plus the resolvingConsumers, leaving the rest for everything else. Raising
// it spends the shared Cloud SQL budget; lower the claim cap with it.
const (
	dbMaxOpenConns = 8
	// MaxConcurrentClaims caps the mailbox claims in flight on one pod.
	MaxConcurrentClaims = 3
	// resolvingConsumers are the AMQP consumers that can hold a connection
	// across an items call: mail.letter.requested and member.signedup (the
	// welcome). Each consumes one delivery at a time.
	resolvingConsumers = 2
)

func InitDB() *sqlx.DB {
	var (
		host     = getEnvAsString("DB_HOST", "localhost")
		port     = getEnvAsInt("DB_PORT", 5432)
		user     = getEnvAsString("DB_USER", "postgres")
		password = getEnvAsString("DB_PASSWORD", "password")
		dbname   = getEnvAsString("DB_NAME", "notification_db")
	)

	psqlInfo := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	db, err := sqlx.Connect("postgres", psqlInfo)
	if err != nil {
		panic(fmt.Errorf("failed to connect to database: %w", err))
	}

	db.SetMaxOpenConns(dbMaxOpenConns)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	if err = db.Ping(); err != nil {
		panic(fmt.Errorf("failed to ping database: %w", err))
	}

	runMigrations(db.DB, dbname)

	slog.Info("Connected to database", slog.String("dbname", dbname))
	return db
}

func runMigrations(db *sql.DB, dbname string) {
	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		log.Fatalf("Could not create postgres driver: %v", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		dbname,
		driver,
	)
	if err != nil {
		log.Fatalf("Could not create migrate instance: %v", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("Could not run migrations: %v", err)
	}

	slog.Info("Migrations completed successfully")
}

func getEnvAsString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
