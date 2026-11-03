package member

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"go.opentelemetry.io/otel/attribute"
)

type repository struct {
	DB *sqlx.DB
}

func NewRepository(db *sqlx.DB) *repository {
	return &repository{
		DB: db,
	}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("member repo", op, err)
}

func (r *repository) Create(ctx context.Context, name, email, password string) (uuid.UUID, error) {
	ctx, span := repoTracer.Start(ctx, "repository.Create")
	defer span.End()

	span.SetAttributes(attribute.String("email", email)) // debug

	memberId := uuid.New()
	query := `INSERT INTO members (id, name, email, password) VALUES ($1, $2, $3, $4)`

	_, err := r.DB.Exec(query, memberId, name, email, password)
	if err != nil {
		slog.Error("Error creating member", "error", err)
		return uuid.Nil, wrapDBErr("create member", err)
	}

	return memberId, nil
}

func (r *repository) CreateTx(ctx context.Context, tx *sqlx.Tx, name, email, password string) (uuid.UUID, error) {
	ctx, span := repoTracer.Start(ctx, "repository.CreateTx")
	defer span.End()

	span.SetAttributes(attribute.String("email", email))

	memberId := uuid.New()
	query := `INSERT INTO members (id, name, email, password) VALUES ($1, $2, $3, $4)`

	_, err := tx.ExecContext(ctx, query, memberId, name, email, password)
	if err != nil {
		slog.Error("Error creating member in tx", "error", err)
		return uuid.Nil, wrapDBErr("create member in tx", err)
	}

	return memberId, nil
}

func (r *repository) UpdatePassword(ctx context.Context, params MemberUpdatePasswordParams) error {
	query := `UPDATE members SET password = :password WHERE id = :id`

	result, err := r.DB.NamedExec(query, params)
	if err != nil {
		return wrapDBErr("update password", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no member found with id: %v", params.ID)
	}

	return nil
}

func (r *repository) UpdateMemberInfo(ctx context.Context, id uuid.UUID, name, status string) error {
	params := MemberUpdateInfoParams{
		ID:     id,
		Name:   name,
		Status: status,
	}

	query := `UPDATE members SET name = :name, status = :status WHERE id = :id`

	result, err := r.DB.NamedExec(query, params)
	if err != nil {
		return wrapDBErr("update member info", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no member found with id: %v", params.ID)
	}

	return nil
}

func (r *repository) GetByIdWithPassword(ctx context.Context, id uuid.UUID) (*models.Member, error) {
	query := `SELECT * FROM members WHERE members.id = $1`

	var member models.Member
	err := r.DB.Get(&member, query, id)
	if err != nil {
		return nil, wrapDBErr("get member by id with password", err)
	}

	return &member, nil
}

func (r *repository) GetById(ctx context.Context, id uuid.UUID) (*models.Member, error) {
	query := `SELECT * FROM members WHERE members.id = $1`

	var member models.Member
	err := r.DB.Get(&member, query, id)
	if err != nil {
		return nil, wrapDBErr("get member by id", err)
	}

	// Remove password from the struct
	member.Password = ""

	return &member, nil
}

func (r *repository) GetMemberByEmail(ctx context.Context, email string) (*models.Member, error) {
	var member models.Member
	query := `SELECT * FROM members WHERE members.email = $1`

	err := r.DB.Get(&member, query, email)
	if err != nil {
		return nil, wrapDBErr("get member by email", err)
	}

	return &member, nil
}

func (r *repository) VerifyCredentials(ctx context.Context, email, password string) (*models.Member, error) {
	// First get the member by email
	member, err := r.GetMemberByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	// The password validation will be handled in the service layer
	return member, nil
}

func (r *repository) CreateDefaultMembers(ctx context.Context, members []CreateDefaultMember) error {
	query := `
	INSERT INTO members(id, email, name, password, status)
	VALUES(:id, :email, :name, :password, :status)
	ON CONFLICT (id) DO NOTHING
	`
	_, err := r.DB.NamedExec(query, members)

	if err != nil {
		return wrapDBErr("create default members", err)
	}

	return nil
}

func (r *repository) UpdateAvatarURL(ctx context.Context, memberID uuid.UUID, avatarURL string) (*models.Member, error) {
	var member models.Member

	query := `UPDATE
							members
						SET avatar_url = $2
						WHERE id = $1
						RETURNING *`

	err := r.DB.GetContext(ctx, &member, query, memberID, avatarURL)

	if err != nil {
		return nil, wrapDBErr("update avatar url", err)
	}

	return &member, nil
}

/**
* Same as UpdateAvatarURL but in a transaction
**/
func (r *repository) UpdateAvatarURLTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID, avatarURL string) (*models.Member, error) {
	var member models.Member

	query := `UPDATE 
							members 
						SET avatar_url = $2 
						WHERE id = $1
						RETURNING *`

	err := tx.GetContext(ctx, &member, query, memberID, avatarURL)

	if err != nil {
		return nil, wrapDBErr("update avatar url in tx", err)
	}

	return &member, nil
}

// SetAccountIDTx caches wallet's account id onto the member, inside a
// transaction the CALLER owns — the same transaction that records the event as
// processed, so a redelivery cannot write twice and a failure leaves neither.
//
// RETURNING is load-bearing: an UPDATE that matches no row is not an error in
// SQL, and this must fail loudly. auth produced the signup that started the
// loop, so a member row that is not there is a genuine inconsistency rather
// than a race (FS-9KW9F §Edge States).
//
// The UNIQUE constraint on account_id is likewise allowed to surface. A second
// member taking an account another already holds is a consumer bug, and two
// members quietly sharing one account's history is the outcome worth wedging a
// queue to avoid.
func (r *repository) SetAccountIDTx(ctx context.Context, tx *sqlx.Tx, memberID, accountID uuid.UUID) error {
	var member models.Member

	query := `UPDATE members SET account_id = $2 WHERE id = $1 RETURNING *`

	if err := tx.GetContext(ctx, &member, query, memberID, accountID); err != nil {
		return wrapDBErr("set account id in tx", err)
	}

	return nil
}

func (r *repository) GetStripeCustomerID(ctx context.Context, memberID uuid.UUID) (string, error) {
	var customerID *string
	query := `SELECT stripe_customer_id FROM members WHERE id = $1`
	err := r.DB.GetContext(ctx, &customerID, query, memberID)
	if err != nil {
		return "", wrapDBErr("get stripe customer id", err)
	}
	if customerID == nil {
		return "", nil
	}
	return *customerID, nil
}

func (r *repository) SetStripeCustomerID(ctx context.Context, memberID uuid.UUID, customerID string) error {
	query := `UPDATE members SET stripe_customer_id = $2 WHERE id = $1`
	_, err := r.DB.ExecContext(ctx, query, memberID, customerID)
	if err != nil {
		return wrapDBErr("set stripe customer id", err)
	}
	return nil
}

func (r *repository) UpdateSubscriptionStatus(ctx context.Context, memberID uuid.UUID, productID, status string) error {
	query := `UPDATE members SET stripe_subscription_product_id = $2, stripe_subscription_status = $3, updated_at = NOW() WHERE id = $1`
	_, err := r.DB.ExecContext(ctx, query, memberID, productID, status)
	if err != nil {
		return wrapDBErr("update subscription status", err)
	}
	return nil
}

// UpsertVerificationCodeTx makes code the member's one live verification code,
// inside the caller's transaction. A new code replaces the old one outright,
// wrong-attempt count included, so issuing always kills the previous code
// (FS-V6SFK §Requirements 11).
func (r *repository) UpsertVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, code VerificationCode) error {
	query := `
	INSERT INTO verification_codes (member_id, code_hash, expires_at, wrong_attempts, issued_at)
	VALUES ($1, $2, $3, 0, $4)
	ON CONFLICT (member_id) DO UPDATE
	   SET code_hash      = EXCLUDED.code_hash,
	       expires_at     = EXCLUDED.expires_at,
	       wrong_attempts = 0,
	       issued_at      = EXCLUDED.issued_at
	`

	if _, err := tx.ExecContext(ctx, query, code.MemberID, code.CodeHash, code.ExpiresAt, code.IssuedAt); err != nil {
		return wrapDBErr("upsert verification code in tx", err)
	}

	return nil
}

// transactor runs work in one transaction on the auth database.
type transactor struct {
	db *sqlx.DB
}

func NewTransactor(db *sqlx.DB) *transactor {
	return &transactor{db: db}
}

// InTx commits when fn returns nil and rolls back otherwise.
func (t *transactor) InTx(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
	tx, err := t.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	// no-op once Commit has run
	defer func() { _ = tx.Rollback() }()

	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// LockMemberTx reads the member and holds its row until the caller's
// transaction ends (FOR UPDATE), so verification work on one member is
// serialized. The password hash is blanked, as in GetById.
func (r *repository) LockMemberTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID) (*models.Member, error) {
	var member models.Member
	if err := tx.GetContext(ctx, &member, `SELECT * FROM members WHERE id = $1 FOR UPDATE`, id); err != nil {
		return nil, wrapDBErr("lock member in tx", err)
	}
	member.Password = ""
	return &member, nil
}

// VerificationCodeTx reads the member's code row, expired or not. No row
// answers commonconstants.ErrNotFound.
func (r *repository) VerificationCodeTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*VerificationCode, error) {
	var code VerificationCode
	query := `
	SELECT member_id, code_hash, expires_at, wrong_attempts, issued_at
	  FROM verification_codes
	 WHERE member_id = $1
	`
	if err := tx.GetContext(ctx, &code, query, memberID); err != nil {
		return nil, wrapDBErr("get verification code in tx", err)
	}
	return &code, nil
}

// CountWrongVerificationAttemptTx adds one wrong try to the member's code.
func (r *repository) CountWrongVerificationAttemptTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) error {
	query := `UPDATE verification_codes SET wrong_attempts = wrong_attempts + 1 WHERE member_id = $1`
	if _, err := tx.ExecContext(ctx, query, memberID); err != nil {
		return wrapDBErr("count wrong verification attempt in tx", err)
	}
	return nil
}

// DeleteVerificationCodeTx removes the member's code once it is used. A
// burned code is kept, so its issued_at still holds the resend cooldown.
func (r *repository) DeleteVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM verification_codes WHERE member_id = $1`, memberID); err != nil {
		return wrapDBErr("delete verification code in tx", err)
	}
	return nil
}

// MarkEmailVerifiedTx records the member as verified at at and returns the
// updated member, password blanked.
func (r *repository) MarkEmailVerifiedTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID, at time.Time) (*models.Member, error) {
	var member models.Member
	query := `UPDATE members SET email_verified_at = $2, updated_at = NOW() WHERE id = $1 RETURNING *`
	if err := tx.GetContext(ctx, &member, query, memberID, at); err != nil {
		return nil, wrapDBErr("mark email verified in tx", err)
	}
	member.Password = ""
	return &member, nil
}

// UpdateEmailTx moves the member to email, already normalized, and returns
// the updated member, password blanked. An address another member holds
// answers commonconstants.ErrDuplicateResource from the lower(email) unique
// index.
func (r *repository) UpdateEmailTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID, email string) (*models.Member, error) {
	var member models.Member
	query := `UPDATE members SET email = $2, updated_at = NOW() WHERE id = $1 RETURNING *`
	if err := tx.GetContext(ctx, &member, query, memberID, email); err != nil {
		return nil, wrapDBErr("update email in tx", err)
	}
	member.Password = ""
	return &member, nil
}
