package member_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The column write and the inbox row must commit or roll back TOGETHER, and a
// duplicate account_id must be refused by the database. Neither is a property a
// fake can have, so these run against auth's real database.
//
// Defaults to the local compose values so `go test ./...` exercises them rather
// than skipping silently.
func authDSN() string {
	get := func(k, fallback string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return fallback
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		get("DB_USER", "user"), get("DB_PASSWORD", "password"),
		get("DB_HOST", "localhost"), get("DB_PORT", "5216"),
		get("DB_NAME", "barrowspire_auth_service_db"))
}

func authDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := sqlx.Connect("postgres", authDSN())
	if err != nil {
		t.Skipf("auth database unreachable, skipping integration test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// seedMember inserts the bare minimum a member row needs.
func seedMember(t *testing.T, db *sqlx.DB) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := db.Exec(
		`INSERT INTO members (id, name, email, password) VALUES ($1, $2, $3, $4)`,
		id, "Delver", fmt.Sprintf("%s@barrowspire.test", id), "hash")
	require.NoError(t, err)
	t.Cleanup(func() { db.Exec(`DELETE FROM members WHERE id = $1`, id) })
	return id
}

func accountIDOf(t *testing.T, db *sqlx.DB, memberID uuid.UUID) *uuid.UUID {
	t.Helper()
	var got *uuid.UUID
	require.NoError(t, db.Get(&got, `SELECT account_id FROM members WHERE id = $1`, memberID))
	return got
}

func newRecorder(t *testing.T, db *sqlx.DB) *member.AccountRecorder {
	t.Helper()
	return member.NewAccountRecorder(db, member.NewRepository(db), commoninbox.NewRepo())
}

// FS-0006 §Requirements 15. The loop's last hop.
func TestRecordAccount_FirstDelivery_SetsTheColumn(t *testing.T) {
	db := authDB(t)
	memberID, accountID := seedMember(t, db), uuid.New()

	require.NoError(t, newRecorder(t, db).Record(context.Background(), member.RecordAccountCommand{
		EventID: uuid.New(), MemberID: memberID, AccountID: accountID,
	}))

	got := accountIDOf(t, db, memberID)
	require.NotNil(t, got, "the column must no longer be NULL")
	assert.Equal(t, accountID, *got)
}

// FS-0006 §Requirements 16, §Edge States. A redelivery changes nothing and
// reports already-processed so the consumer can ack it.
func TestRecordAccount_Redelivery_LeavesTheColumnUnchanged(t *testing.T) {
	db := authDB(t)
	memberID, accountID := seedMember(t, db), uuid.New()
	cmd := member.RecordAccountCommand{EventID: uuid.New(), MemberID: memberID, AccountID: accountID}
	rec := newRecorder(t, db)

	require.NoError(t, rec.Record(context.Background(), cmd))
	err := rec.Record(context.Background(), cmd)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	got := accountIDOf(t, db, memberID)
	require.NotNil(t, got)
	assert.Equal(t, accountID, *got, "the column is untouched by a redelivery")
}

// FS-0006 §Requirements 9, §Edge States: "the message wedges deliberately".
// Two members sharing one account would mean two people reading one account's
// history. The UNIQUE constraint refuses it and the error must PROPAGATE — the
// tempting fix of swallowing it converts a detectable consumer bug into silent
// data corruption.
func TestRecordAccount_DuplicateAccountID_IsRefused(t *testing.T) {
	db := authDB(t)
	first, second := seedMember(t, db), seedMember(t, db)
	accountID := uuid.New()
	rec := newRecorder(t, db)

	require.NoError(t, rec.Record(context.Background(), member.RecordAccountCommand{
		EventID: uuid.New(), MemberID: first, AccountID: accountID,
	}))

	err := rec.Record(context.Background(), member.RecordAccountCommand{
		EventID: uuid.New(), MemberID: second, AccountID: accountID,
	})

	require.Error(t, err, "a second member may not take an account already held")
	assert.Nil(t, accountIDOf(t, db, second), "and the second member keeps NULL")
}

// FS-0006 §Edge States. auth produced the signup that started the loop, so the
// member necessarily preceded the event: a missing row is a real inconsistency,
// not a race, and must not be silently acked away.
func TestRecordAccount_UnknownMember_IsAnError(t *testing.T) {
	db := authDB(t)

	err := newRecorder(t, db).Record(context.Background(), member.RecordAccountCommand{
		EventID: uuid.New(), MemberID: uuid.New(), AccountID: uuid.New(),
	})

	assert.Error(t, err, "an account.created for a member that does not exist must not pass silently")
}

// FS-0006 §Requirements 15, 18, and the acceptance criterion the entire feature
// exists for: after the loop completes, the member's next token carries the claim.
//
// Composes the three pieces that actually run on the login path — the recorder
// writes the column, the repository reads the member back, the minter turns it
// into a claim — rather than asserting each in isolation and hoping. What it
// does NOT cover is the broker hop (wallet publishes, auth consumes); that needs
// both services running and is the one part of this loop no unit test reaches.
func TestRecordAccount_ThenMint_ProducesATokenCarryingTheClaim(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-the-loop")

	db := authDB(t)
	memberID, accountID := seedMember(t, db), uuid.New()
	repo := member.NewRepository(db)

	// Before the loop: the member exists, the claim does not.
	before, err := repo.GetById(context.Background(), memberID)
	require.NoError(t, err)
	require.Nil(t, before.AccountID, "a fresh member has no wallet account yet")

	tokenBefore, err := auth.GenerateJWT(*before, commonconstants.Access, time.Hour)
	require.NoError(t, err)
	_, present := decodeClaims(t, tokenBefore)["account_id"]
	require.False(t, present, "and so mints no account_id claim")

	// The loop's last hop.
	require.NoError(t, member.NewAccountRecorder(db, repo, commoninbox.NewRepo()).
		Record(context.Background(), member.RecordAccountCommand{
			EventID: uuid.New(), MemberID: memberID, AccountID: accountID,
		}))

	// After: the very next mint carries it.
	after, err := repo.GetById(context.Background(), memberID)
	require.NoError(t, err)
	require.NotNil(t, after.AccountID)

	tokenAfter, err := auth.GenerateJWT(*after, commonconstants.Access, time.Hour)
	require.NoError(t, err)
	assert.Equal(t, accountID.String(), decodeClaims(t, tokenAfter)["account_id"],
		"the claim FS-0003's ledger read path has been waiting for")
}

func decodeClaims(t *testing.T, tokenStr string) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, &claims, func(*jwt.Token) (any, error) {
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	require.NoError(t, err)
	return claims
}
