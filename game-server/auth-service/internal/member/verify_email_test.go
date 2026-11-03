package member_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeTx runs the work with no real transaction and records whether it would
// have committed (the work returned nil) or rolled back.
type fakeTx struct {
	commits, rollbacks int
}

func (f *fakeTx) InTx(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
	if err := fn(nil); err != nil {
		f.rollbacks++
		return err
	}
	f.commits++
	return nil
}

// memStore is one member and their live code, in memory. It is both the
// verifier's store and the real CodeIssuer's writer, so a code the issuer
// draws is the code the verifier checks.
type memStore struct {
	member      models.Member
	code        *member.VerificationCode
	emailUpdate func(email string) error // nil accepts every address
}

func (s *memStore) LockMemberTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) (*models.Member, error) {
	if id != s.member.ID {
		return nil, commonconstants.ErrNotFound
	}
	m := s.member
	return &m, nil
}

func (s *memStore) VerificationCodeTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) (*member.VerificationCode, error) {
	if s.code == nil || s.code.MemberID != id {
		return nil, commonconstants.ErrNotFound
	}
	c := *s.code
	return &c, nil
}

func (s *memStore) UpsertVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, code member.VerificationCode) error {
	s.code = &code
	return nil
}

func (s *memStore) CountWrongVerificationAttemptTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) error {
	s.code.WrongAttempts++
	return nil
}

func (s *memStore) DeleteVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) error {
	s.code = nil
	return nil
}

func (s *memStore) MarkEmailVerifiedTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, at time.Time) (*models.Member, error) {
	s.member.EmailVerifiedAt = &at
	m := s.member
	return &m, nil
}

func (s *memStore) UpdateEmailTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, email string) (*models.Member, error) {
	if s.emailUpdate != nil {
		if err := s.emailUpdate(email); err != nil {
			return nil, err
		}
	}
	s.member.Email = email
	m := s.member
	return &m, nil
}

// fakeClock is the one clock the issuer stamps codes with and the verifier
// checks them against.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

type verifyHarness struct {
	store    *memStore
	outbox   *fakeOutbox
	tx       *fakeTx
	clock    *fakeClock
	verifier *member.Verifier
}

func newVerifyHarness() *verifyHarness {
	h := &verifyHarness{
		store: &memStore{member: models.Member{
			ID: uuid.New(), Name: "Delver", Email: "delver@barrowspire.test", Role: "player",
		}},
		outbox: &fakeOutbox{},
		tx:     &fakeTx{},
		clock:  &fakeClock{t: time.Now()},
	}
	issuer := member.NewCodeIssuer(h.store, h.outbox, h.clock.now)
	h.verifier = member.NewVerifier(h.tx, h.store, issuer, h.clock.now)
	return h
}

func (h *verifyHarness) id() uuid.UUID { return h.store.member.ID }

// issue draws a code through the real issuer, as signup does, and returns
// the plaintext the mail would carry.
func (h *verifyHarness) issue(t *testing.T) string {
	t.Helper()
	issuer := member.NewCodeIssuer(h.store, h.outbox, h.clock.now)
	require.NoError(t, issuer.IssueTx(context.Background(), nil, member.Recipient{
		MemberID: h.id(), Name: h.store.member.Name, Email: h.store.member.Email,
	}))
	return h.lastMailed(t).Code
}

func (h *verifyHarness) lastMailed(t *testing.T) commonconstants.MemberVerificationRequestedEventPayload {
	t.Helper()
	require.NotEmpty(t, h.outbox.written, "no verification mail was queued")
	return verificationPayload(t, h.outbox.written[len(h.outbox.written)-1])
}

// wrong returns a 6-digit code that is not code.
func wrong(code string) string {
	if code == "000000" {
		return "000001"
	}
	return "000000"
}

// FS-V6SFK §Requirements 13, 17, §Acceptance Criteria: the right code
// verifies the member and deletes the code row.
func TestVerify_RightCode_VerifiesAndDeletesTheCode(t *testing.T) {
	h := newVerifyHarness()
	code := h.issue(t)

	got, err := h.verifier.Verify(context.Background(), h.id(), code)

	require.NoError(t, err)
	require.NotNil(t, got.EmailVerifiedAt)
	assert.True(t, got.EmailVerifiedAt.Equal(h.clock.now()), "verified at the verifier's now")
	assert.Nil(t, h.store.code, "success deletes the code row")
	assert.Equal(t, 1, h.tx.commits)
}

// FS-V6SFK §Requirements 13, 17: a wrong code is refused and counted. The
// count must COMMIT even though the call is refused, or a guesser could retry
// forever.
func TestVerify_WrongCode_IsRefusedAndCounted(t *testing.T) {
	h := newVerifyHarness()
	code := h.issue(t)

	got, err := h.verifier.Verify(context.Background(), h.id(), wrong(code))

	assert.Nil(t, got)
	assert.Equal(t, errcode.VerificationCodeInvalid, refusalCode(t, err))
	require.NotNil(t, h.store.code)
	assert.Equal(t, 1, h.store.code.WrongAttempts)
	assert.Equal(t, 1, h.tx.commits, "the wrong try is committed, not rolled back")
	assert.Nil(t, h.store.member.EmailVerifiedAt)
}

// FS-V6SFK §Requirements 13, §Acceptance Criteria: five wrong entries, then
// the right code, answers VERIFICATION_CODE_EXPIRED. The 5th wrong entry is
// itself still a wrong code; it is the one that burns the row.
func TestVerify_FifthWrongTry_BurnsTheCode(t *testing.T) {
	h := newVerifyHarness()
	code := h.issue(t)
	ctx := context.Background()

	for try := 1; try <= 5; try++ {
		_, err := h.verifier.Verify(ctx, h.id(), wrong(code))
		assert.Equal(t, errcode.VerificationCodeInvalid, refusalCode(t, err), "try %d", try)
	}
	// Burned, not deleted: the row stays as a dead code so its issued_at
	// still holds the resend cooldown (FS-V6SFK §Edge States, Abuse).
	require.NotNil(t, h.store.code, "the burned row is kept")
	assert.Equal(t, 5, h.store.code.WrongAttempts)

	_, err := h.verifier.Verify(ctx, h.id(), code)
	assert.Equal(t, errcode.VerificationCodeExpired, refusalCode(t, err))
	assert.Nil(t, h.store.member.EmailVerifiedAt)
}

// FS-V6SFK §Edge States (Abuse): guessing is capped at 5 tries per code AND
// one code per 60 seconds, so burning a code must not reset the cooldown. A
// resend or an email change right after the 5th wrong try is refused; once the
// cooldown is over, the new code verifies.
func TestBurnedCode_KeepsTheResendCooldown(t *testing.T) {
	burn := func(t *testing.T) *verifyHarness {
		h := newVerifyHarness()
		code := h.issue(t)
		for try := 1; try <= 5; try++ {
			_, err := h.verifier.Verify(context.Background(), h.id(), wrong(code))
			require.Equal(t, errcode.VerificationCodeInvalid, refusalCode(t, err))
		}
		return h
	}

	t.Run("resend", func(t *testing.T) {
		h := burn(t)
		ctx := context.Background()

		err := h.verifier.Resend(ctx, h.id())
		assert.Equal(t, errcode.VerificationResendTooSoon, refusalCode(t, err))
		assert.Len(t, h.outbox.written, 1, "no second mail inside the cooldown")

		h.clock.advance(resendCooldownForTest)
		require.NoError(t, h.verifier.Resend(ctx, h.id()))
		_, err = h.verifier.Verify(ctx, h.id(), h.lastMailed(t).Code)
		assert.NoError(t, err, "the code issued after a burn starts with a clean count")
	})

	t.Run("change email", func(t *testing.T) {
		h := burn(t)

		_, err := h.verifier.ChangeEmail(context.Background(), h.id(), "other@example.com")

		assert.Equal(t, errcode.VerificationResendTooSoon, refusalCode(t, err))
		assert.Equal(t, "delver@barrowspire.test", h.store.member.Email)
	})
}

// resendCooldownForTest is FS-V6SFK §Requirements 15's 60 seconds.
const resendCooldownForTest = 60 * time.Second

// FS-V6SFK §Requirements 13, 17, §Edge States (Empty, Expired): no live code,
// whether never issued or past its 15 minutes, answers EXPIRED.
func TestVerify_NoLiveCode_IsExpired(t *testing.T) {
	t.Run("never issued", func(t *testing.T) {
		h := newVerifyHarness()

		_, err := h.verifier.Verify(context.Background(), h.id(), "123456")

		assert.Equal(t, errcode.VerificationCodeExpired, refusalCode(t, err))
	})

	t.Run("15 minutes after issue", func(t *testing.T) {
		h := newVerifyHarness()
		code := h.issue(t)
		h.clock.advance(15 * time.Minute)

		_, err := h.verifier.Verify(context.Background(), h.id(), code)

		assert.Equal(t, errcode.VerificationCodeExpired, refusalCode(t, err))
		assert.Nil(t, h.store.member.EmailVerifiedAt)
	})

	t.Run("just inside 15 minutes still verifies", func(t *testing.T) {
		h := newVerifyHarness()
		code := h.issue(t)
		h.clock.advance(15*time.Minute - time.Second)

		_, err := h.verifier.Verify(context.Background(), h.id(), code)

		assert.NoError(t, err)
	})
}

// FS-V6SFK §Requirements 17 (amendment 4), §Edge States (Concurrent,
// Disconnected): an already-verified member succeeds whatever code is sent,
// and nothing changes.
func TestVerify_AlreadyVerified_IsANoOp(t *testing.T) {
	h := newVerifyHarness()
	verifiedAt := h.clock.now().Add(-time.Hour)
	h.store.member.EmailVerifiedAt = &verifiedAt

	got, err := h.verifier.Verify(context.Background(), h.id(), "not-a-code")

	require.NoError(t, err)
	require.NotNil(t, got.EmailVerifiedAt)
	assert.True(t, got.EmailVerifiedAt.Equal(verifiedAt), "the original verification time stands")
}

// FS-V6SFK §Requirements 15, 18, §Acceptance Criteria: a resend inside 60
// seconds of the last issue is refused; after it, a new code goes out and the
// old one no longer verifies.
func TestResend_Cooldown(t *testing.T) {
	h := newVerifyHarness()
	old := h.issue(t)
	ctx := context.Background()

	h.clock.advance(59 * time.Second)
	err := h.verifier.Resend(ctx, h.id())
	assert.Equal(t, errcode.VerificationResendTooSoon, refusalCode(t, err))
	assert.Len(t, h.outbox.written, 1, "no mail inside the cooldown")

	h.clock.advance(time.Second)
	require.NoError(t, h.verifier.Resend(ctx, h.id()))
	require.Len(t, h.outbox.written, 2)
	fresh := h.lastMailed(t)
	assert.Equal(t, "delver@barrowspire.test", fresh.Email)

	if fresh.Code != old {
		_, err = h.verifier.Verify(ctx, h.id(), old)
		assert.Equal(t, errcode.VerificationCodeInvalid, refusalCode(t, err), "the old code died with the resend")
	}
	_, err = h.verifier.Verify(ctx, h.id(), fresh.Code)
	assert.NoError(t, err)
}

// FS-V6SFK §Requirements 18, §Edge States (Empty): with no code row at all,
// say never issued, a resend issues straight away.
func TestResend_NoCodeRow_Issues(t *testing.T) {
	h := newVerifyHarness()

	require.NoError(t, h.verifier.Resend(context.Background(), h.id()))

	assert.Len(t, h.outbox.written, 1)
	assert.NotNil(t, h.store.code)
}

// FS-V6SFK §Requirements 18 (amendment 4): a verified member has nothing to
// resend.
func TestResend_AlreadyVerified_IsRefused(t *testing.T) {
	h := newVerifyHarness()
	verifiedAt := h.clock.now()
	h.store.member.EmailVerifiedAt = &verifiedAt

	err := h.verifier.Resend(context.Background(), h.id())

	assert.Equal(t, errcode.EmailAlreadyVerified, refusalCode(t, err))
	assert.Empty(t, h.outbox.written)
}

// FS-V6SFK §Requirements 6, 19, §Acceptance Criteria: an unverified member's
// new address is normalized, stored, and mailed a fresh code, in one
// transaction.
func TestChangeEmail_Unverified_UpdatesAndMailsTheNewAddress(t *testing.T) {
	h := newVerifyHarness()
	h.issue(t)
	h.clock.advance(time.Minute)

	got, err := h.verifier.ChangeEmail(context.Background(), h.id(), "  Fixed@Example.COM ")

	require.NoError(t, err)
	assert.Equal(t, "fixed@example.com", got.Email)
	assert.Equal(t, "fixed@example.com", h.store.member.Email)
	assert.Equal(t, "fixed@example.com", h.lastMailed(t).Email, "the code goes to the new address")
	assert.Len(t, h.outbox.written, 2)
	assert.Equal(t, 1, h.tx.commits, "the change and its code share one transaction")
}

// FS-V6SFK §Requirements 19: the same address as the current one behaves as a
// resend, so it is a fresh code under the same cooldown and no email write.
func TestChangeEmail_SameAddress_IsAResend(t *testing.T) {
	h := newVerifyHarness()
	h.issue(t)
	h.store.emailUpdate = func(string) error {
		t.Fatal("the same address must not be written again")
		return nil
	}
	ctx := context.Background()

	_, err := h.verifier.ChangeEmail(ctx, h.id(), "DELVER@barrowspire.test")
	assert.Equal(t, errcode.VerificationResendTooSoon, refusalCode(t, err))

	h.clock.advance(time.Minute)
	got, err := h.verifier.ChangeEmail(ctx, h.id(), "DELVER@barrowspire.test")
	require.NoError(t, err)
	assert.Equal(t, "delver@barrowspire.test", got.Email)
	assert.Len(t, h.outbox.written, 2)
}

// FS-V6SFK §Requirements 7, 15, 19, §Acceptance Criteria, §Edge States
// (Concurrent, Abuse): every refusal leaves the address and the code alone.
func TestChangeEmail_Refusals(t *testing.T) {
	tests := []struct {
		name    string
		setup   func(h *verifyHarness)
		email   string
		wantErr func(t *testing.T, err error)
	}{
		{
			name:  "malformed address",
			email: "Name <a@b.c>",
			wantErr: func(t *testing.T, err error) {
				assert.Equal(t, errcode.EmailInvalid, refusalCode(t, err))
			},
		},
		{
			name: "already verified",
			setup: func(h *verifyHarness) {
				at := h.clock.now()
				h.store.member.EmailVerifiedAt = &at
			},
			email: "new@example.com",
			wantErr: func(t *testing.T, err error) {
				assert.Equal(t, errcode.EmailAlreadyVerified, refusalCode(t, err))
			},
		},
		{
			name:  "inside the cooldown",
			setup: func(h *verifyHarness) { h.issue(t) },
			email: "new@example.com",
			wantErr: func(t *testing.T, err error) {
				assert.Equal(t, errcode.VerificationResendTooSoon, refusalCode(t, err))
			},
		},
		{
			name: "taken by someone else",
			setup: func(h *verifyHarness) {
				h.store.emailUpdate = func(string) error { return commonconstants.ErrDuplicateResource }
			},
			email: "taken@example.com",
			wantErr: func(t *testing.T, err error) {
				assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newVerifyHarness()
			if tt.setup != nil {
				tt.setup(h)
			}
			mailed := len(h.outbox.written)

			got, err := h.verifier.ChangeEmail(context.Background(), h.id(), tt.email)

			assert.Nil(t, got)
			tt.wantErr(t, err)
			assert.Equal(t, "delver@barrowspire.test", h.store.member.Email)
			assert.Len(t, h.outbox.written, mailed, "no new code was mailed")
		})
	}
}
