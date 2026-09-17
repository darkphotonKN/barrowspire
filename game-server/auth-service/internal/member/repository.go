package member

import (
	"context"
	"fmt"
	"log/slog"

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
