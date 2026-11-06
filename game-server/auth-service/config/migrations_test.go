package config_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
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

const (
	dropAvatarUp   = "000014_drop_avatar_uploads.up.sql"
	dropAvatarDown = "000014_drop_avatar_uploads.down.sql"
)

// replayMigrations points the session at a fresh schema and runs the real up
// files through version, in order. public stays on the search_path for
// uuid_generate_v4, which an already-installed extension keeps there. The
// scratch schema comes first, so every object the files create or alter is its
// own. The caller's transaction rolls all of it back.
func replayMigrations(t *testing.T, exec sqlx.Execer, version int) {
	t.Helper()
	schema := "tvczq_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	_, err := exec.Exec(fmt.Sprintf(`CREATE SCHEMA %s; SET LOCAL search_path TO %s, public;`, schema, schema))
	require.NoError(t, err)

	files, err := filepath.Glob("../migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, files)
	for _, file := range files {
		var n int
		_, err := fmt.Sscanf(filepath.Base(file), "%06d", &n)
		require.NoError(t, err)
		if n > version {
			continue
		}
		_, err = exec.Exec(readMigration(t, filepath.Base(file)))
		require.NoError(t, err, file)
	}
}

// scratchAt is a rolled-back transaction holding the schema as it stood at version.
func scratchAt(t *testing.T, db *sqlx.DB, version int) *sqlx.Tx {
	t.Helper()
	tx, err := db.Beginx()
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback() })
	replayMigrations(t, tx, version)
	return tx
}

// avatarShape lists everything 000014 removes, read from the catalog: the
// members column and the table's columns, constraints, indexes and trigger.
func avatarShape(t *testing.T, tx *sqlx.Tx) []string {
	t.Helper()
	var shape []string
	require.NoError(t, tx.Select(&shape, `
		SELECT 'column ' || table_name || '.' || column_name || ' ' || data_type
		       || ' ' || coalesce(character_maximum_length::text, '-')
		       || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '-')
		  FROM information_schema.columns
		 WHERE table_schema = current_schema()
		   AND (table_name = 'avatar_uploads' OR (table_name = 'members' AND column_name = 'avatar_url'))
		UNION ALL
		SELECT 'constraint ' || conname || ' ' || pg_get_constraintdef(oid)
		  FROM pg_constraint
		 WHERE conrelid = to_regclass(current_schema() || '.avatar_uploads')
		UNION ALL
		SELECT 'index ' || indexdef
		  FROM pg_indexes
		 WHERE schemaname = current_schema() AND tablename = 'avatar_uploads'
		UNION ALL
		SELECT 'trigger ' || pg_get_triggerdef(oid)
		  FROM pg_trigger
		 WHERE tgrelid = to_regclass(current_schema() || '.avatar_uploads') AND NOT tgisinternal
		ORDER BY 1`))
	return shape
}

// seedSignedInMember inserts a member at 000014's shape who can sign in.
func seedSignedInMember(t *testing.T, exec sqlx.Execer, email, password string) uuid.UUID {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)
	id := uuid.New()
	_, err = exec.Exec(`INSERT INTO members (id, name, email, password) VALUES ($1, 'Delver', $2, $3)`, id, email, string(hash))
	require.NoError(t, err)
	return id
}

// FS-TVCZQ §Requirements 19: the table and the column go, with their data, and
// the member row stays.
func TestDropAvatarMigration_Up_DropsTableAndColumn(t *testing.T) {
	tx := scratchAt(t, migrationDB(t), 13)
	id := uuid.New()
	_, err := tx.Exec(`INSERT INTO members (id, name, email, password, avatar_url)
		VALUES ($1, 'Delver', 'foo@example.com', 'hash', 'https://cdn.example.com/a.png')`, id)
	require.NoError(t, err)
	_, err = tx.Exec(`INSERT INTO avatar_uploads (member_id, s3_key) VALUES ($1, 'k')`, id)
	require.NoError(t, err)
	require.NotEmpty(t, avatarShape(t, tx))

	_, err = tx.Exec(readMigration(t, dropAvatarUp))
	require.NoError(t, err)

	assert.Empty(t, avatarShape(t, tx), "no avatar column, table, index, constraint or trigger is left")
	var email string
	require.NoError(t, tx.Get(&email, `SELECT email FROM members WHERE id = $1`, id))
	assert.Equal(t, "foo@example.com", email)
}

// FS-TVCZQ §Requirements 20: the down file restores the empty column and table
// exactly as 000008 left them, and no URL comes back.
func TestDropAvatarMigration_Down_RestoresTheShapeAfter000008(t *testing.T) {
	tx := scratchAt(t, migrationDB(t), 13)
	want := avatarShape(t, tx)
	id := uuid.New()
	_, err := tx.Exec(`INSERT INTO members (id, name, email, password, avatar_url)
		VALUES ($1, 'Delver', 'foo@example.com', 'hash', 'https://cdn.example.com/a.png')`, id)
	require.NoError(t, err)
	_, err = tx.Exec(readMigration(t, dropAvatarUp))
	require.NoError(t, err)

	_, err = tx.Exec(readMigration(t, dropAvatarDown))
	require.NoError(t, err)

	assert.Equal(t, want, avatarShape(t, tx))
	var url *string
	require.NoError(t, tx.Get(&url, `SELECT avatar_url FROM members WHERE id = $1`, id))
	assert.Nil(t, url, "no URL comes back")
	var timestamptz int
	require.NoError(t, tx.Get(&timestamptz, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'avatar_uploads'
		  AND data_type = 'timestamp with time zone'`))
	assert.Equal(t, 3, timestamptz, "000008's TIMESTAMPTZ columns, not 000004's TIMESTAMP")

	// The restored trigger still runs, and the up file applies again.
	_, err = tx.Exec(`INSERT INTO avatar_uploads (member_id, s3_key) VALUES ($1, 'k')`, id)
	require.NoError(t, err)
	_, err = tx.Exec(`UPDATE avatar_uploads SET upload_status = 'failed'`)
	require.NoError(t, err)
	_, err = tx.Exec(readMigration(t, dropAvatarUp))
	assert.NoError(t, err)
}

// FS-TVCZQ §Requirements 19: every SELECT * and RETURNING * scans a members row
// that has no avatar_url.
func TestMemberRepository_After000014_ScansTheRow(t *testing.T) {
	db := migrationDB(t)
	tx := scratchAt(t, db, 14)
	id := seedSignedInMember(t, tx, "foo@example.com", "abcdefghij")
	repo := member.NewRepository(db)
	ctx := context.Background()

	locked, err := repo.LockMemberTx(ctx, tx, id)
	require.NoError(t, err)
	assert.Equal(t, "foo@example.com", locked.Email)

	require.NoError(t, repo.SetAccountIDTx(ctx, tx, id, uuid.New()))

	updated, err := repo.UpdateEmailTx(ctx, tx, id, "bar@example.com")
	require.NoError(t, err)
	assert.Equal(t, "bar@example.com", updated.Email)

	verified, err := repo.MarkEmailVerifiedTx(ctx, tx, id, time.Now())
	require.NoError(t, err)
	assert.NotNil(t, verified.EmailVerifiedAt)
}

// FS-TVCZQ §Acceptance Criteria: member read and sign-in work after 000014.
//
// The service reads through *sqlx.DB rather than a transaction, so the pool is
// held to one connection and BEGIN runs on it: nothing here ever commits, and a
// crashed test loses the transaction with the connection.
func TestMemberService_After000014_ReadsAndSignsIn(t *testing.T) {
	db := migrationDB(t)
	db.SetMaxOpenConns(1)
	_, err := db.Exec(`BEGIN`)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = db.Exec(`ROLLBACK`) })
	replayMigrations(t, db, 14)
	t.Setenv("JWT_SECRET", "test-secret")

	id := seedSignedInMember(t, db, "foo@example.com", "abcdefghij")
	repo := member.NewRepository(db)
	svc := member.NewService(db, repo, nil, nil, member.NewPasswordPolicy(""), nil, nil)
	ctx := context.Background()

	got, err := svc.GetMember(ctx, &pb.GetMemberRequest{Id: id.String()})
	require.NoError(t, err)
	assert.Equal(t, "foo@example.com", got.Email)

	login, err := svc.LoginMember(ctx, &pb.LoginRequest{Email: "foo@example.com", Password: "abcdefghij"})
	require.NoError(t, err)
	assert.NotEmpty(t, login.AccessToken)
	assert.Equal(t, id.String(), login.MemberInfo.Id)
}
