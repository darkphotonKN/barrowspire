package member

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// verificationCodeLifetime is how long a code verifies after it is issued
// (FS-V6SFK §Requirements 13).
const verificationCodeLifetime = 15 * time.Minute

// resendCooldown is how soon after an issue another code may be issued, by
// resend or by an email change (FS-V6SFK §Requirements 15).
const resendCooldown = 60 * time.Second

// maxWrongVerificationAttempts is the wrong entry that burns a code: the 5th
// (FS-V6SFK §Requirements 13).
//
// A burned code is a row whose count reached this, NOT a deleted row. That
// deviates from R13's literal "deletes the row" on purpose: the row carries
// issued_at, and deleting it would let a resend follow the 5th wrong try at
// once, so a guesser would get 5 tries per mail with no 60-second wait. The
// FS §Edge States (Abuse) caps both, and keeping the dead row is what holds
// the cooldown.
const maxWrongVerificationAttempts = 5

// verificationCodeSpace is the number of distinct 6-digit codes: 000000-999999.
var verificationCodeSpace = big.NewInt(1_000_000)

// VerificationCodeWriter is what issuance needs from storage: replace the
// member's one live code, inside the caller's transaction.
type VerificationCodeWriter interface {
	UpsertVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, code VerificationCode) error
}

// Recipient is the member a verification code is issued to, and the address
// it is mailed to.
type Recipient struct {
	MemberID uuid.UUID
	Name     string
	Email    string // normalized
}

// CodeIssuer issues verification codes (FS-V6SFK §Requirements 11-16,
// ADR-0040). Every issuance writes the member's code row and its
// member.verification_requested outbox row in the transaction the caller owns,
// so the code is live exactly when its mail is on the way: signup, resend and
// change email all go through IssueTx.
type CodeIssuer struct {
	codes  VerificationCodeWriter
	outbox commonoutbox.OutboxPublisher
	now    func() time.Time
}

// NewCodeIssuer takes the clock that stamps issued_at and expires_at; the
// Verifier that later checks expiry and the resend cooldown must read the same
// one.
func NewCodeIssuer(codes VerificationCodeWriter, outbox commonoutbox.OutboxPublisher, now func() time.Time) *CodeIssuer {
	return &CodeIssuer{codes: codes, outbox: outbox, now: now}
}

// IssueTx draws a fresh code for the recipient, replacing any live one, and
// queues its mail. The plaintext code leaves this function only inside the
// outbox payload: it is stored as a hash and never logged.
func (i *CodeIssuer) IssueTx(ctx context.Context, tx *sqlx.Tx, to Recipient) error {
	code, err := newVerificationCode(rand.Reader)
	if err != nil {
		return fmt.Errorf("draw verification code: %w", err)
	}

	issuedAt := i.now().UTC()
	row := VerificationCode{
		MemberID:  to.MemberID,
		CodeHash:  hashVerificationCode(to.MemberID, code),
		ExpiresAt: issuedAt.Add(verificationCodeLifetime),
		IssuedAt:  issuedAt,
	}
	if err := i.codes.UpsertVerificationCodeTx(ctx, tx, row); err != nil {
		return fmt.Errorf("store verification code: %w", err)
	}

	payload, err := json.Marshal(commonconstants.MemberVerificationRequestedEventPayload{
		EventID:   uuid.NewString(),
		MemberID:  to.MemberID.String(),
		Name:      to.Name,
		Email:     to.Email,
		Code:      code,
		ExpiresAt: row.ExpiresAt,
	})
	if err != nil {
		return fmt.Errorf("marshal verification requested payload: %w", err)
	}

	if err := i.outbox.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		RoutingKey: commonconstants.MemberVerificationRequestedEvent,
		Exchange:   commonconstants.AuthEventsExchange,
		Payload:    payload,
	}); err != nil {
		return fmt.Errorf("write verification requested outbox: %w", err)
	}

	return nil
}

// newVerificationCode draws 6 decimal digits uniformly over 000000-999999.
// rand.Int rejects out-of-range draws rather than taking a modulus, so no code
// is likelier than another; the zero padding keeps every code 6 digits long.
func newVerificationCode(random io.Reader) (string, error) {
	n, err := rand.Int(random, verificationCodeSpace)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashVerificationCode is the only form of a code auth stores: SHA-256 over
// the member id and the code. Salting with the member id means one code value
// hashes differently for every member.
func hashVerificationCode(memberID uuid.UUID, code string) []byte {
	sum := sha256.Sum256([]byte(memberID.String() + code))
	return sum[:]
}

// Transactor runs fn inside one database transaction: committed when fn
// returns nil, rolled back otherwise.
type Transactor interface {
	InTx(ctx context.Context, fn func(tx *sqlx.Tx) error) error
}

// VerificationStore is what checking codes and changing the email need from
// storage, every call inside the caller's transaction.
type VerificationStore interface {
	// LockMemberTx reads the member and holds its row for the transaction,
	// so verify, resend and change email on one member run one at a time.
	LockMemberTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) (*models.Member, error)
	// VerificationCodeTx answers commonconstants.ErrNotFound when the member
	// has no code row.
	VerificationCodeTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) (*VerificationCode, error)
	CountWrongVerificationAttemptTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) error
	DeleteVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) error
	MarkEmailVerifiedTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, at time.Time) (*models.Member, error)
	UpdateEmailTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, email string) (*models.Member, error)
}

// Verifier owns a member's way from unverified to verified (FS-V6SFK
// §Requirements 13, 15, 17-19): checking a code, resending one, and changing
// the address while unverified. Every operation locks the member row first and
// does all its reads and writes in that one transaction.
type Verifier struct {
	tx     Transactor
	store  VerificationStore
	issuer VerificationCodeIssuer
	now    func() time.Time
}

func NewVerifier(tx Transactor, store VerificationStore, issuer VerificationCodeIssuer, now func() time.Time) *Verifier {
	return &Verifier{tx: tx, store: store, issuer: issuer, now: now}
}

// Verify checks code against the member's live code and, when it matches,
// marks the member verified and deletes the code. An already-verified member
// gets themselves back whatever code was sent (amendment 4), so a double
// submit or a lost response never surfaces as an error.
func (v *Verifier) Verify(ctx context.Context, memberID uuid.UUID, code string) (*models.Member, error) {
	var (
		verified *models.Member
		refusal  error
	)
	err := v.tx.InTx(ctx, func(tx *sqlx.Tx) error {
		m, err := v.store.LockMemberTx(ctx, tx, memberID)
		if err != nil {
			return fmt.Errorf("lock member: %w", err)
		}
		if m.EmailVerifiedAt != nil {
			verified = m
			return nil
		}

		live, err := v.liveCode(ctx, tx, memberID)
		if err != nil {
			return err
		}
		if live == nil {
			refusal = errcode.Refuse(errcode.VerificationCodeExpired)
			return nil
		}

		if subtle.ConstantTimeCompare(hashVerificationCode(memberID, code), live.CodeHash) != 1 {
			// Refused, yet the transaction COMMITS: the counted try is the
			// whole defence against guessing, so it must not roll back with
			// the refusal.
			refusal = errcode.Refuse(errcode.VerificationCodeInvalid)
			return v.countWrongTry(ctx, tx, live)
		}

		if err := v.store.DeleteVerificationCodeTx(ctx, tx, memberID); err != nil {
			return fmt.Errorf("delete verification code: %w", err)
		}
		verified, err = v.store.MarkEmailVerifiedTx(ctx, tx, memberID, v.now())
		if err != nil {
			return fmt.Errorf("mark email verified: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if refusal != nil {
		return nil, refusal
	}
	return verified, nil
}

// Resend issues the unverified member a new code, killing the old one.
func (v *Verifier) Resend(ctx context.Context, memberID uuid.UUID) error {
	var refusal error
	err := v.tx.InTx(ctx, func(tx *sqlx.Tx) error {
		m, err := v.store.LockMemberTx(ctx, tx, memberID)
		if err != nil {
			return fmt.Errorf("lock member: %w", err)
		}
		if refusal, err = v.reissueRefusal(ctx, tx, m); err != nil || refusal != nil {
			return err
		}
		return v.issue(ctx, tx, m)
	})
	if err != nil {
		return err
	}
	return refusal
}

// ChangeEmail moves an unverified member to a new address and issues a code
// to it, in one transaction. The same address as the current one is a resend.
// An address another member holds answers ErrDuplicateResource from the
// store's unique index, which also settles a race with a signup.
func (v *Verifier) ChangeEmail(ctx context.Context, memberID uuid.UUID, email string) (*models.Member, error) {
	// A refusal the caller fixes by changing the request, so it runs before
	// any database work, as at signup.
	email, err := NormalizeEmail(email)
	if err != nil {
		return nil, err
	}

	var (
		changed *models.Member
		refusal error
	)
	err = v.tx.InTx(ctx, func(tx *sqlx.Tx) error {
		m, err := v.store.LockMemberTx(ctx, tx, memberID)
		if err != nil {
			return fmt.Errorf("lock member: %w", err)
		}
		if refusal, err = v.reissueRefusal(ctx, tx, m); err != nil || refusal != nil {
			return err
		}
		if email != m.Email {
			if m, err = v.store.UpdateEmailTx(ctx, tx, memberID, email); err != nil {
				return fmt.Errorf("update email: %w", err)
			}
		}
		changed = m
		return v.issue(ctx, tx, m)
	})
	if err != nil {
		return nil, err
	}
	if refusal != nil {
		return nil, refusal
	}
	return changed, nil
}

// reissueRefusal answers why m may not be issued a new code, or nil when it
// may: m is already verified, or the last code went out less than the
// cooldown ago. The refusal is the first result; the error is only for a
// failed read.
//
// The caller holds m's row lock, which is what makes the cooldown hold: two
// requests racing for one member queue on the lock, and the second sees the
// first one's issued_at.
func (v *Verifier) reissueRefusal(ctx context.Context, tx *sqlx.Tx, m *models.Member) (refusal error, err error) {
	if m.EmailVerifiedAt != nil {
		return errcode.Refuse(errcode.EmailAlreadyVerified), nil
	}

	last, err := v.store.VerificationCodeTx(ctx, tx, m.ID)
	switch {
	case errors.Is(err, commonconstants.ErrNotFound):
		// nothing issued yet, or the last code was used (and the member
		// verified). A burned code keeps its row, so it still counts here.
		return nil, nil
	case err != nil:
		return nil, fmt.Errorf("read verification code: %w", err)
	case v.now().Sub(last.IssuedAt) < resendCooldown:
		return errcode.Refuse(errcode.VerificationResendTooSoon), nil
	}
	return nil, nil
}

// issue draws m a new code, mailed to m.Email.
func (v *Verifier) issue(ctx context.Context, tx *sqlx.Tx, m *models.Member) error {
	if err := v.issuer.IssueTx(ctx, tx, Recipient{MemberID: m.ID, Name: m.Name, Email: m.Email}); err != nil {
		return fmt.Errorf("issue verification code: %w", err)
	}
	return nil
}

// liveCode is the member's code while it still verifies, or nil when there is
// none: never issued, already used, burned, or past its 15 minutes.
func (v *Verifier) liveCode(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*VerificationCode, error) {
	row, err := v.store.VerificationCodeTx(ctx, tx, memberID)
	if errors.Is(err, commonconstants.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read verification code: %w", err)
	}
	if !v.now().Before(row.ExpiresAt) || row.WrongAttempts >= maxWrongVerificationAttempts {
		return nil, nil
	}
	return row, nil
}

// countWrongTry adds one to the code's wrong tries; the 5th leaves it burned
// (see maxWrongVerificationAttempts).
func (v *Verifier) countWrongTry(ctx context.Context, tx *sqlx.Tx, live *VerificationCode) error {
	if err := v.store.CountWrongVerificationAttemptTx(ctx, tx, live.MemberID); err != nil {
		return fmt.Errorf("count wrong verification attempt: %w", err)
	}
	return nil
}
