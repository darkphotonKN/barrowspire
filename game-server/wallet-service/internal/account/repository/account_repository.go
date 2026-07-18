package repository

import (
	"context"
	"database/sql"
	"fmt"
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
	Status    string    `db:"status"`
	Amount    int       `db:"amount"`
	ExpiredAt time.Time `db:"expired_at"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

// FindByID(ctx context.Context, id uuid.UUID) (*Account, error)
func (r *AccountRepository) FindByID(ctx context.Context, id uuid.UUID) (*account.Account, error) {
	var acc AccountRow
	var holds []HoldsRow

	err := commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	}, func(tx *sqlx.Tx) error {

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

		err := tx.GetContext(ctx, &acc, accountQuery, id)

		if err != nil {
			return commonhelpers.WrapDBErr("account", "FindByID", err)
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

		err = tx.SelectContext(ctx, &holds, holdsQuery, id)

		if err != nil {
			return commonhelpers.WrapDBErr("account", "FindByID", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// data successfully retrieved, construct and reconstitute

	reconstitutedHolds := make([]*account.HoldReconstituteParams, 0, len(holds))

	for _, hold := range holds {
		reconstitutedHolds = append(reconstitutedHolds, &account.HoldReconstituteParams{
			ID:        hold.ID,
			AccountID: hold.AccountID,
			BidID:     hold.BidID,
			Status:    account.WalletHoldStatus(hold.Status),
			Amount:    hold.Amount,
			ExpiredAt: hold.ExpiredAt,
			CreatedAt: hold.CreatedAt,
			UpdatedAt: hold.UpdatedAt,
		})
	}

	reconstitutedAcc, err := account.Reconstitute(account.ReconstituteParams{
		ID:        acc.ID,
		MemberID:  acc.MemberID,
		Gold:      acc.Gold,
		Version:   acc.Version,
		Holds:     reconstitutedHolds,
		CreatedAt: acc.CreatedAt,
		UpdatedAt: acc.UpdatedAt,
	})

	if err != nil {
		return nil, fmt.Errorf("repo findById, reconstitute : %w", err)
	}

	return reconstitutedAcc, nil
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
// save must return the senintel ErrConcurrentModification to signify a
// race error when attempting optimisitic updates
// account/errors.go's isRetriable and usecase/retry.go's withRetry relies on this
// to work
func (r *AccountRepository) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	after := acc.Snapshot()

	// diff account
	changes := r.diffAccount(&before, &after)
	slog.Debug("checking account changes in save method", "changes", changes)

	wipQuery := `
	UPDATE accounts
	SET gold = $1, version = version + 1
	WHERE id = $2 AND version = $3
	`

	// TODO: changes.gold could be nil
	return commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
	}, func(tx *sqlx.Tx) error {
		// update account
		res, err := tx.ExecContext(ctx, wipQuery, changes.gold, after.ID, changes.expectedVersion)

		if err != nil {
			return commonhelpers.WrapDBErr("account", "save", err)
		}

		n, _ := res.RowsAffected()

		if n == 0 {
			return account.ErrConcurrentModification
		}

		// TODO: update holds
		var newHoldsQuery string
		for _, hold := range changes.newHolds {
			slog.Debug("temp", newHoldsQuery, hold)

		}

		return nil
	})
}

// using pointers to signify change
// nil = no change
type AccountChanges struct {
	// account changes
	gold            *int
	expectedVersion *int

	// holds that changed
	holdsUpdated []*holdChanges

	// holds added
	newHolds []*HoldsRow
}

type holdChanges struct {
	id     uuid.UUID // id to track which holds changed
	status *account.WalletHoldStatus
}

func (r *AccountRepository) diffAccount(before, after *account.AccountSnapshot) *AccountChanges {
	if before == nil || after == nil {
		return nil
	}

	changes := &AccountChanges{}

	// --- account differences ---

	// gold changed, update to new amount's gold
	if before.Gold != after.Gold {
		changes.gold = &after.Gold
	}

	// --- holds differences ---
	newHolds := make([]*HoldsRow, 0)
	updatedHolds := make([]*holdChanges, 0)

	// track seen holds in map, also for comparison to track differences and new additions in a single loop
	// algorithm pass through once with O(n) to build the map of seen, then pass through again to check off
	seen := make(map[uuid.UUID]account.WalletHoldSnapshot)

	for _, hold := range before.WalletHolds {
		// add all to map as a checklist
		seen[hold.ID] = hold
	}

	for _, afterHold := range after.WalletHolds {
		// -- holds added --
		// any new ids are added as NEW holds
		if beforeHold, ok := seen[afterHold.ID]; !ok {
			newHolds = append(newHolds, &HoldsRow{
				ID:        afterHold.ID,
				BidID:     afterHold.BidID,
				AccountID: afterHold.AccountID,
				Status:    string(afterHold.Status),
				Amount:    afterHold.Amount,
				ExpiredAt: afterHold.ExpiredAt,
				CreatedAt: afterHold.CreatedAt,
				UpdatedAt: afterHold.UpdatedAt,
			})

			// matching / seen, are old holds, update them
		} else {
			// -- holds updated --
			isChanged := false
			updatedHold := &holdChanges{
				id: afterHold.ID,
			}

			if afterHold.Status != beforeHold.Status {
				updatedHold.status = &afterHold.Status
				isChanged = true
			}

			if !isChanged {
				continue
			}

			// track update changes
			updatedHolds = append(updatedHolds, updatedHold)
		}

	}

	return &AccountChanges{
		gold:            changes.gold,
		expectedVersion: &before.Version,
		holdsUpdated:    updatedHolds,
		newHolds:        newHolds,
	}
}
