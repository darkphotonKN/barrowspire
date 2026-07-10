package repository

import (
	"context"
	"log/slog"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type AccountRepository struct {
	db *sqlx.DB
}

func NewAccountRepository(db *sqlx.DB) *AccountRepository {
	return &AccountRepository{
		db: db,
	}
}

type AccountRow struct {
	ID        uuid.UUID `db:"id"`
	MemberID  uuid.UUID `db:"member_id"`
	Gold      int       `db:"gold"`
	Version   int       `db:"version"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

type HoldsRow struct {
	ID        uuid.UUID `db:"id"`
	AccountID uuid.UUID `db:"account_id"`
	BidID     uuid.UUID `db:"bid_id"`
	Status    int       `db:"status"`
	Amount    int       `db:"amount"`
	ExpiredAt time.Time `db:"expired_at"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

// FindById(ctx context.Context, id uuid.UUID) (*Account, error)
func (r *AccountRepository) FindById(ctx context.Context, id uuid.UUID) (*account.Account, error) {

	// get single account
	accountQuery := `
	SELECT 
		id,
		member_id,
		gold,
		version,
		created_at,
		updated_at
	FROM accounts
	WHERE id = $1
	`

	var account AccountRow

	err := r.db.GetContext(ctx, &account, accountQuery, id)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("account", "FindById", err)
	}

	// grab all related holds
	// get single account
	holdsQuery := `
	SELECT 
		id,
		account_id,
		bid_id,
		status,
		amount,
		expired_at,
		created_at, 
		updated_at
	FROM wallet_holds 
	WHERE account_id = $1
	`

	var holds []HoldsRow

	err = r.db.SelectContext(ctx, holds, holdsQuery, id)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("account", "FindById", err)
	}

	return nil, nil
}

func (r *AccountRepository) Insert(ctx context.Context, account *account.Account) error {
	snapshot := account.Snapshot()

	query := `
	INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
	VALUES(:id, :member_id, :gold, :version, :created_at, :updated_at)
	`

	_, err := r.db.NamedExecContext(ctx, query, map[string]interface{}{
		"id":         snapshot.ID,
		"member_id":  snapshot.MemberID,
		"gold":       snapshot.Gold,
		"version":    snapshot.Version,
		"created_at": snapshot.CreatedAt,
		"updated_at": snapshot.UpdatedAt,
	})

	if err != nil {
		// propogate context and sentinel errors if they match with helper
		return commonhelpers.WrapDBErr("account", "insert", err)
	}

	return nil
}

// Save updates the resource with any changes to the domain. Essentially an "update"
func (r *AccountRepository) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	after := acc.Snapshot()

	// diff account
	// NOTE: WIP
	changes := r.diffAccount(before, after)

	slog.Debug("checking changes in save method", "changes", changes)

	return nil
}

type AccountChanges struct{}

func (r *AccountRepository) diffAccount(before, after account.AccountSnapshot) AccountChanges {
	return AccountChanges{}
}
