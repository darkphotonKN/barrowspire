package config_test

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The email migration is exercised against real Postgres, since a collision
// check is a property of SQL, not of Go. Each case runs the up file inside a
// scratch schema in a transaction that is always rolled back, so auth's own
// members table is never read or written.
//
// Defaults to the local compose values, like the member package's integration
// tests, and skips when the database is unreachable.
func migrationDB(t *testing.T) *sqlx.DB {
	t.Helper()
	get := func(k, fallback string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return fallback
	}
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		get("DB_USER", "user"), get("DB_PASSWORD", "password"),
		get("DB_HOST", "localhost"), get("DB_PORT", "5216"),
		get("DB_NAME", "barrowspire_auth_service_db"))
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("auth database unreachable, skipping integration test: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func readMigration(t *testing.T, name string) string {
	t.Helper()
	sql, err := os.ReadFile("../migrations/" + name)
	require.NoError(t, err)
	return string(sql)
}

// scratchMembers opens a rolled-back transaction whose search_path points at
// a fresh schema holding a members table shaped like the real one's email
// column (TEXT UNIQUE NOT NULL), seeded with emails.
func scratchMembers(t *testing.T, db *sqlx.DB, emails ...string) *sqlx.Tx {
	t.Helper()
	tx, err := db.Beginx()
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback() })

	schema := "v6sfk_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	_, err = tx.Exec(fmt.Sprintf(`CREATE SCHEMA %s; SET LOCAL search_path TO %s;
		CREATE TABLE members (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL);`, schema, schema))
	require.NoError(t, err)
	for _, email := range emails {
		_, err = tx.Exec(`INSERT INTO members (id, email) VALUES ($1, $2)`, uuid.New(), email)
		require.NoError(t, err)
	}
	return tx
}

// FS-V6SFK §Requirements 8: existing emails are trimmed and lowercased, and
// the lower(email) index then refuses a case variant.
func TestNormalizeEmailMigration_LowercasesAndIndexes(t *testing.T) {
	// The trim set is ASCII whitespace only, matching member.emailTrimSet: a
	// vertical tab is trimmed, a non-breaking space is kept, as in Go.
	tx := scratchMembers(t, migrationDB(t),
		" Foo@Example.COM\t", "bar@example.com", "\vBaz@example.com\f", "\u00a0Qux@example.com")

	_, err := tx.Exec(readMigration(t, "000012_normalize_member_email.up.sql"))
	require.NoError(t, err)

	var emails []string
	require.NoError(t, tx.Select(&emails, `SELECT email FROM members ORDER BY id`))
	assert.ElementsMatch(t,
		[]string{"bar@example.com", "baz@example.com", "foo@example.com", "\u00a0qux@example.com"}, emails)

	_, err = tx.Exec(`INSERT INTO members (id, email) VALUES ($1, 'BAR@example.com')`, uuid.New())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "members_email_lower_key")
}

// FS-V6SFK §Requirements 8: rows that collide once normalized fail the
// migration loudly, naming the address, and nothing is merged or deleted.
func TestNormalizeEmailMigration_CaseCollision_FailsLoudly(t *testing.T) {
	tx := scratchMembers(t, migrationDB(t), "Foo@Example.com", "foo@example.com ", "bar@example.com")

	_, err := tx.Exec(readMigration(t, "000012_normalize_member_email.up.sql"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "foo@example.com (2 rows)")
}

// The down migration drops the case-insensitive index and nothing else.
func TestNormalizeEmailMigration_Down_DropsTheIndex(t *testing.T) {
	tx := scratchMembers(t, migrationDB(t), "foo@example.com")
	_, err := tx.Exec(readMigration(t, "000012_normalize_member_email.up.sql"))
	require.NoError(t, err)

	_, err = tx.Exec(readMigration(t, "000012_normalize_member_email.down.sql"))
	require.NoError(t, err)

	_, err = tx.Exec(`INSERT INTO members (id, email) VALUES ($1, 'FOO@example.com')`, uuid.New())
	assert.NoError(t, err, "without the index a case variant is no longer refused")
}

// FS-V6SFK §Requirements 10-11: every existing member starts unverified, and
// a member holds at most one live code.
func TestEmailVerificationMigration_ExistingMembersUnverified_OneCodePerMember(t *testing.T) {
	tx := scratchMembers(t, migrationDB(t), "foo@example.com", "bar@example.com")

	_, err := tx.Exec(readMigration(t, "000013_add_email_verification.up.sql"))
	require.NoError(t, err)

	var verified int
	require.NoError(t, tx.Get(&verified, `SELECT count(*) FROM members WHERE email_verified_at IS NOT NULL`))
	assert.Zero(t, verified, "no existing member is verified")

	var memberID uuid.UUID
	require.NoError(t, tx.Get(&memberID, `SELECT id FROM members WHERE email = 'foo@example.com'`))
	_, err = tx.Exec(`INSERT INTO verification_codes (member_id, code_hash, expires_at, issued_at)
		VALUES ($1, '\x00', NOW() + interval '15 minutes', NOW())`, memberID)
	require.NoError(t, err)
	_, err = tx.Exec(`INSERT INTO verification_codes (member_id, code_hash, expires_at, issued_at)
		VALUES ($1, '\x01', NOW() + interval '15 minutes', NOW())`, memberID)
	require.Error(t, err, "one live code per member")
}

// Deleting a member deletes its code, and the down migration removes both
// the column and the table.
func TestEmailVerificationMigration_CascadeAndDown(t *testing.T) {
	tx := scratchMembers(t, migrationDB(t), "foo@example.com")
	_, err := tx.Exec(readMigration(t, "000013_add_email_verification.up.sql"))
	require.NoError(t, err)

	_, err = tx.Exec(`INSERT INTO verification_codes (member_id, code_hash, expires_at, issued_at)
		SELECT id, '\x00', NOW() + interval '15 minutes', NOW() FROM members`)
	require.NoError(t, err)
	_, err = tx.Exec(`DELETE FROM members`)
	require.NoError(t, err)
	var codes int
	require.NoError(t, tx.Get(&codes, `SELECT count(*) FROM verification_codes`))
	assert.Zero(t, codes, "the code row went with its member")

	_, err = tx.Exec(readMigration(t, "000013_add_email_verification.down.sql"))
	require.NoError(t, err)
	var columns int
	require.NoError(t, tx.Get(&columns, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'members' AND column_name = 'email_verified_at'`))
	assert.Zero(t, columns, "column dropped")
}
