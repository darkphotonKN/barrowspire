package member_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The repository half of FS-V6SFK §Requirements 13, 17-19, against a real
// auth database. Skipped when none is reachable.

func seedCode(t *testing.T, db *sqlx.DB, repo interface {
	UpsertVerificationCodeTx(context.Context, *sqlx.Tx, member.VerificationCode) error
}, memberID uuid.UUID) {
	t.Helper()
	tx := db.MustBegin()
	now := time.Now().UTC()
	require.NoError(t, repo.UpsertVerificationCodeTx(context.Background(), tx, member.VerificationCode{
		MemberID: memberID, CodeHash: []byte("hash"), ExpiresAt: now.Add(15 * time.Minute), IssuedAt: now,
	}))
	require.NoError(t, tx.Commit())
}

func TestVerificationStore_CodeLifecycle(t *testing.T) {
	db := authDB(t)
	id := seedMember(t, db)
	repo := member.NewRepository(db)
	transactor := member.NewTransactor(db)
	ctx := context.Background()

	err := transactor.InTx(ctx, func(tx *sqlx.Tx) error {
		_, err := repo.VerificationCodeTx(ctx, tx, id)
		assert.ErrorIs(t, err, commonconstants.ErrNotFound, "no row answers ErrNotFound")
		return nil
	})
	require.NoError(t, err)

	seedCode(t, db, repo, id)
	require.NoError(t, transactor.InTx(ctx, func(tx *sqlx.Tx) error {
		m, err := repo.LockMemberTx(ctx, tx, id)
		require.NoError(t, err)
		assert.Empty(t, m.Password, "the locked member never carries the password hash")
		assert.Nil(t, m.EmailVerifiedAt)

		require.NoError(t, repo.CountWrongVerificationAttemptTx(ctx, tx, id))
		code, err := repo.VerificationCodeTx(ctx, tx, id)
		require.NoError(t, err)
		assert.Equal(t, 1, code.WrongAttempts)
		assert.Equal(t, []byte("hash"), code.CodeHash)

		require.NoError(t, repo.DeleteVerificationCodeTx(ctx, tx, id))
		_, err = repo.VerificationCodeTx(ctx, tx, id)
		assert.ErrorIs(t, err, commonconstants.ErrNotFound)

		at := time.Now().UTC().Truncate(time.Microsecond)
		m, err = repo.MarkEmailVerifiedTx(ctx, tx, id, at)
		require.NoError(t, err)
		require.NotNil(t, m.EmailVerifiedAt)
		assert.True(t, m.EmailVerifiedAt.Equal(at))
		assert.Empty(t, m.Password)
		return nil
	}))

	got, err := repo.GetById(ctx, id)
	require.NoError(t, err)
	assert.NotNil(t, got.EmailVerifiedAt, "the transaction committed")
}

func TestVerificationStore_UpdateEmail(t *testing.T) {
	db := authDB(t)
	id := seedMember(t, db)
	other := seedMember(t, db)
	repo := member.NewRepository(db)
	transactor := member.NewTransactor(db)
	ctx := context.Background()
	fresh := "moved-" + uuid.NewString() + "@barrowspire.test"

	require.NoError(t, transactor.InTx(ctx, func(tx *sqlx.Tx) error {
		m, err := repo.UpdateEmailTx(ctx, tx, id, fresh)
		require.NoError(t, err)
		assert.Equal(t, fresh, m.Email)
		assert.Empty(t, m.Password)
		return nil
	}))

	// another member's address, compared case-insensitively by the
	// lower(email) unique index
	err := transactor.InTx(ctx, func(tx *sqlx.Tx) error {
		_, err := repo.UpdateEmailTx(ctx, tx, other, fresh)
		return err
	})
	assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
}

func TestTransactor_RollsBackOnError(t *testing.T) {
	db := authDB(t)
	id := seedMember(t, db)
	repo := member.NewRepository(db)
	ctx := context.Background()
	boom := errors.New("test: abort")

	err := member.NewTransactor(db).InTx(ctx, func(tx *sqlx.Tx) error {
		if _, err := repo.MarkEmailVerifiedTx(ctx, tx, id, time.Now()); err != nil {
			return err
		}
		return boom
	})

	assert.ErrorIs(t, err, boom)
	got, err := repo.GetById(ctx, id)
	require.NoError(t, err)
	assert.Nil(t, got.EmailVerifiedAt, "rolled back")
}
