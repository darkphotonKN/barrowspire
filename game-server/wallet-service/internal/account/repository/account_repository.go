package repository

import (
	"context"

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

// FindById(ctx context.Context, id uuid.UUID) (*Account, error)
func (r *AccountRepository) FindById(ctx context.Context, id uuid.UUID) (*account.Account, error) {
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
func (r *AccountRepository) Save(ctx context.Context, account *account.Account) error {
	snapshot := account.Snapshot()

	// optimistic lock with version check
	accountQuery := `
	UPDATE accounts (gold, version)
	SET gold = :gold, version = version + 1
	WHERE version = :expected_version
	`

	// batch insert
	var holdsQuery string

	_, err := r.db.NamedExecContext(ctx, query, map[string]interface{}{
		"id":         snapshot.ID,
		"member_id":  snapshot.MemberID,
		"gold":       snapshot.Gold,
		"version":    snapshot.Version,
		"created_at": snapshot.CreatedAt,
		// updated_at automatically updated through trigger
	})

	if err != nil {
		// propogate context and sentinel errors if they match with helper
		return commonhelpers.WrapDBErr("account", "save", err)
	}

	if len(snapshot.WalletHolds) != 0 {

	}

	return nil
}
