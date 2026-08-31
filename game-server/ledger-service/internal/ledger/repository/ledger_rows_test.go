package repository

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const migrationPath = "../../../migrations/000001_create_ledger_transactions_and_entries.up.sql"

// roundTripSchema isolates the round-trip from whatever else lives in the dev
// database. Dropped and recreated per run, so the DDL below always applies to
// an empty schema and its non-IF-NOT-EXISTS indexes never collide.
const roundTripSchema = "ledger_rows_roundtrip_test"

const defaultTestDSN = "postgres://user:password@localhost:5226/barrowspire_ledger_service_db?sslmode=disable"

// --- tag ↔ column agreement (no database required) ---

// The db tags are only meaningful if they name real columns, and the scan
// targets are only complete if every column has a field. Reading the migration
// rather than restating it means a future column that nobody adds to a struct
// fails here instead of at 3am in a scan error.
func TestRowTagsMatchMigrationColumnsOneForOne(t *testing.T) {
	columns := parseMigrationColumns(t)

	tests := []struct {
		name  string
		table string
		row   any
	}{
		{name: "ledger_transactions", table: "ledger_transactions", row: LedgerTransaction{}},
		{name: "ledger_entries", table: "ledger_entries", row: LedgerEntry{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			want, ok := columns[tc.table]
			require.True(t, ok, "migration declares no table %q", tc.table)

			assert.ElementsMatch(t, want, dbTags(tc.row))
		})
	}
}

// account_id is a soft reference to wallet-service's accounts.id: a key held,
// never resolved. A struct field typed as anything richer than a UUID would be
// the first step toward a join this context has no right to make.
func TestRowsCarryNoAccountRelationship(t *testing.T) {
	entry := reflect.TypeOf(LedgerEntry{})

	accountID, ok := entry.FieldByName("AccountID")
	require.True(t, ok, "LedgerEntry must carry an AccountID")
	assert.Equal(t, reflect.TypeOf(uuid.UUID{}), accountID.Type)

	for _, row := range []any{LedgerTransaction{}, LedgerEntry{}} {
		typ := reflect.TypeOf(row)

		for i := range typ.NumField() {
			field := typ.Field(i)

			// uuid.UUID is an array and time.Time a struct; anything else of
			// kind struct or slice would be a joined-in relation.
			switch field.Type {
			case reflect.TypeOf(uuid.UUID{}), reflect.TypeOf(time.Time{}):
				continue
			}

			assert.NotContains(t,
				[]reflect.Kind{reflect.Struct, reflect.Slice, reflect.Ptr},
				field.Type.Kind(),
				"%s.%s embeds a relation; rows are flat", typ.Name(), field.Name)
		}
	}
}

// --- round trip (requires the ledger dev database) ---

// The acceptance criterion: insert a row, scan it back, fields equal what went
// in. INSERT names every column from the db tags and SELECT * scans every
// column back, so a tag that names no column fails on the way out and a column
// with no field fails on the way in.
func TestRowsRoundTrip(t *testing.T) {
	db := roundTripDB(t)

	transaction := LedgerTransaction{
		TransactionID: uuid.New(),
		Reason:        "SETTLE_AUCTION",
		ReferenceID:   uuid.New(),
		Currency:      "GOLD",
		CreatedAt:     time.Now().UTC().Truncate(time.Microsecond),
	}

	entry := LedgerEntry{
		ID:            uuid.New(),
		TransactionID: transaction.TransactionID,
		AccountID:     uuid.New(),
		Direction:     "DEBIT",
		Amount:        1250,
		CreatedAt:     transaction.CreatedAt,
	}

	ctx := context.Background()

	_, err := db.NamedExecContext(ctx, `
	INSERT INTO ledger_transactions (transaction_id, reason, reference_id, currency, created_at)
	VALUES (:transaction_id, :reason, :reference_id, :currency, :created_at)
	`, transaction)
	require.NoError(t, err)

	_, err = db.NamedExecContext(ctx, `
	INSERT INTO ledger_entries (id, transaction_id, account_id, direction, amount, created_at)
	VALUES (:id, :transaction_id, :account_id, :direction, :amount, :created_at)
	`, entry)
	require.NoError(t, err)

	var gotTransaction LedgerTransaction
	require.NoError(t, db.GetContext(ctx, &gotTransaction,
		`SELECT * FROM ledger_transactions WHERE transaction_id = $1`, transaction.TransactionID))

	var gotEntry LedgerEntry
	require.NoError(t, db.GetContext(ctx, &gotEntry,
		`SELECT * FROM ledger_entries WHERE id = $1`, entry.ID))

	// timestamptz comes back in the session's zone; equality is about the
	// instant, not the offset it is printed in.
	assert.True(t, transaction.CreatedAt.Equal(gotTransaction.CreatedAt),
		"transaction created_at: want %v got %v", transaction.CreatedAt, gotTransaction.CreatedAt)
	assert.True(t, entry.CreatedAt.Equal(gotEntry.CreatedAt),
		"entry created_at: want %v got %v", entry.CreatedAt, gotEntry.CreatedAt)

	gotTransaction.CreatedAt = transaction.CreatedAt
	gotEntry.CreatedAt = entry.CreatedAt

	assert.Equal(t, transaction, gotTransaction)
	assert.Equal(t, entry, gotEntry)
}

// --- helpers ---

func dbTags(row any) []string {
	typ := reflect.TypeOf(row)
	tags := make([]string, 0, typ.NumField())

	for i := range typ.NumField() {
		tag := typ.Field(i).Tag.Get("db")

		if tag == "" || tag == "-" {
			continue
		}

		tags = append(tags, tag)
	}

	return tags
}

var createTableRe = regexp.MustCompile(`(?is)CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*?)\n\);`)

// parseMigrationColumns reads the landed DDL so the tests compare against the
// real schema rather than a copy of it that can drift.
func parseMigrationColumns(t *testing.T) map[string][]string {
	t.Helper()

	ddl, err := os.ReadFile(filepath.Clean(migrationPath))
	require.NoError(t, err)

	tables := make(map[string][]string)

	for _, match := range createTableRe.FindAllStringSubmatch(string(ddl), -1) {
		columns := make([]string, 0)

		for _, line := range strings.Split(match[2], "\n") {
			line = strings.TrimSpace(line)

			if line == "" || strings.HasPrefix(line, "--") {
				continue
			}

			name := strings.Fields(line)[0]

			// table-level constraints are not columns
			switch strings.ToUpper(name) {
			case "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "CONSTRAINT":
				continue
			}

			columns = append(columns, name)
		}

		tables[match[1]] = columns
	}

	require.NotEmpty(t, tables, "parsed no tables from %s", migrationPath)

	return tables
}

// roundTripDB builds the schema the round trip runs against, and skips the test
// when no database is reachable — the tag tests above still run everywhere.
func roundTripDB(t *testing.T) *sqlx.DB {
	t.Helper()

	if testing.Short() {
		t.Skip("round trip needs a database; skipped under -short")
	}

	dsn := os.Getenv("LEDGER_TEST_DB_DSN")
	if dsn == "" {
		dsn = defaultTestDSN
	}

	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no ledger database reachable at %s: %v", dsn, err)
	}
	defer func() { _ = admin.Close() }()

	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + roundTripSchema + ` CASCADE`)
	require.NoError(t, err)

	_, err = admin.Exec(`CREATE SCHEMA ` + roundTripSchema)
	require.NoError(t, err)

	db, err := sqlx.Connect("postgres", dsn+"&search_path="+roundTripSchema)
	require.NoError(t, err)

	ddl, err := os.ReadFile(filepath.Clean(migrationPath))
	require.NoError(t, err)

	_, err = db.Exec(string(ddl))
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = db.Close()

		cleanup, err := sqlx.Connect("postgres", dsn)
		if err != nil {
			return
		}
		defer func() { _ = cleanup.Close() }()

		_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + roundTripSchema + ` CASCADE`)
	})

	return db
}
