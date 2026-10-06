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
	"github.com/lib/pq"
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

// FindByBidID resolves a hold's bid to its account, then loads that account
// whole. The two reads need no shared transaction: bid_id is UNIQUE and a hold
// never changes accounts, so the mapping cannot move between them, and any
// concurrent change to the account itself is caught by Save's version check.
func (r *AccountRepository) FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error) {
	var accountID uuid.UUID

	query := `
	SELECT account_id
	FROM wallet_holds
	WHERE bid_id = $1
	`

	if err := r.db.GetContext(ctx, &accountID, query, bidID); err != nil {
		return nil, commonhelpers.WrapDBErr("account", "FindByBidID", err)
	}

	return r.FindByID(ctx, accountID)
}

func (r *AccountRepository) FindByMemberID(ctx context.Context, memberID uuid.UUID) (*account.Account, error) {
	var acc *account.Account

	err := commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	}, func(tx *sqlx.Tx) error {
		var err error
		acc, err = r.FindByMemberIDTx(ctx, tx, memberID)
		return err
	})

	if err != nil {
		return nil, err
	}

	return acc, nil
}

// FindByMemberIDTx is FindByMemberID inside a transaction the CALLER owns.
//
// It exists so a write that already holds a transaction reads on that same
// connection. Reading through r.db instead would hold one connection while
// waiting for a second, and enough concurrent callers would exhaust the pool
// with every one of them waiting on another.
func (r *AccountRepository) FindByMemberIDTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*account.Account, error) {
	var acc AccountRow
	var holds []HoldsRow

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
	WHERE member_id = $1
	`

	err := tx.GetContext(ctx, &acc, accountQuery, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("account", "FindByMemberID", err)
	}

	// grab all related holds
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

	err = tx.SelectContext(ctx, &holds, holdsQuery, acc.ID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("account", "FindByMemberID", err)
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
		return nil, fmt.Errorf("repo findByMemberID, reconstitute : %w", err)
	}

	return reconstitutedAcc, nil
}

// insertAccountQuery is shared by Insert and InsertTx so the two cannot drift
// into writing different columns.
const insertAccountQuery = `
	INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
	VALUES(:id, :member_id, :gold, :version, :created_at, :updated_at)
	`

func insertArgs(acc *account.Account) map[string]interface{} {
	snapshot := acc.Snapshot()
	return map[string]interface{}{
		"id":         snapshot.ID,
		"member_id":  snapshot.MemberID,
		"gold":       snapshot.Gold,
		"version":    snapshot.Version,
		"created_at": snapshot.CreatedAt,
		"updated_at": snapshot.UpdatedAt,
	}
}

// InsertTx is Insert inside a transaction the CALLER owns.
//
// It exists because an account born from a signup event must commit together
// with the outbox row announcing it: an account that exists unannounced is
// invisible to auth-service forever, and an announcement without an account is
// a lie downstream will act on (FS-9KW9F §Req 12).
func (r *AccountRepository) InsertTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account) error {
	if _, err := tx.NamedExecContext(ctx, insertAccountQuery, insertArgs(acc)); err != nil {
		return commonhelpers.WrapDBErr("account", "insert tx", err)
	}
	return nil
}

func (r *AccountRepository) Insert(ctx context.Context, account *account.Account) error {
	_, err := r.db.NamedExecContext(ctx, insertAccountQuery, insertArgs(account))

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
	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		return r.SaveTx(ctx, tx, acc, before)
	})
}

// SaveTx is Save inside a transaction the CALLER owns, under the same
// ErrConcurrentModification contract.
//
// It exists because a seller's credit must commit together with the dedup row
// that makes it exactly-once: a credit without its row is paid again on retry,
// and a row without its credit is a seller never paid (FS-NXP1W §Req 30).
func (r *AccountRepository) SaveTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account, before account.AccountSnapshot) error {
	after := acc.Snapshot()

	// diff account
	changes := r.diffAccount(&before, &after)

	// not possible in practice, but guard for exceptions
	if changes == nil {
		return account.ErrCorruptAccountState
	}

	if changes.IsEmpty() {
		return nil
	}

	slog.Debug("checking account changes in save method", "changes", changes)

	accountQuery := `
	UPDATE accounts
	SET gold = $1, version = version + 1, updated_at = $2
	WHERE id = $3 AND version = $4
	`

	// -- update account --
	res, err := tx.ExecContext(ctx, accountQuery, after.Gold, after.UpdatedAt, after.ID, changes.expectedVersion)

	if err != nil {
		return commonhelpers.WrapDBErr("account", "save", err)
	}

	n, err := res.RowsAffected()

	if err != nil {
		return fmt.Errorf("account save, rows affected: %w", err)
	}

	// race detected
	if n == 0 {
		return account.ErrConcurrentModification
	}

	// -- insert new holds --
	if len(changes.newHolds) != 0 {
		newHoldsQuery := `
	INSERT INTO wallet_holds (id, account_id, bid_id, status, amount, expired_at, created_at, updated_at)
	VALUES (:id, :account_id, :bid_id, :status, :amount, :expired_at, :created_at, :updated_at)
	`
		_, err = tx.NamedExecContext(ctx, newHoldsQuery, changes.newHolds)

		if err != nil {
			return commonhelpers.WrapDBErr("account", "save", err)
		}

	}
	// -- update existing holds --

	if len(changes.holdsUpdated) == 0 {
		return nil
	}

	// create unnest required vertical slices
	ids := make([]string, 0, len(changes.holdsUpdated))
	statuses := make([]string, 0, len(changes.holdsUpdated))
	updatedAts := make([]time.Time, 0, len(changes.holdsUpdated))

	for _, hold := range changes.holdsUpdated {
		ids = append(ids, hold.id.String())
		statuses = append(statuses, string(*hold.status))
		updatedAts = append(updatedAts, hold.updatedAt)
	}

	changedHoldsQuery := `
	UPDATE wallet_holds h
	SET status = v.status,
		updated_at = v.updated_at
	FROM unnest($1::uuid[], $2::text[], $3::timestamptz[])
	AS v(id, status, updated_at)
	WHERE v.id = h.id
	`

	_, err = tx.ExecContext(ctx, changedHoldsQuery, pq.Array(ids), pq.Array(statuses), pq.Array(updatedAts))

	if err != nil {
		return commonhelpers.WrapDBErr("account", "save", err)
	}

	return nil

}

// using pointers to signify change
// nil = no change
type AccountChanges struct {
	// account changes
	gold            *int
	expectedVersion int

	// holds that changed
	holdsUpdated []*holdChanges

	// holds added
	newHolds []*HoldsRow
}

func (c *AccountChanges) IsEmpty() bool {
	return c.gold == nil && len(c.holdsUpdated) == 0 && len(c.newHolds) == 0
}

type holdChanges struct {
	id        uuid.UUID // id to track which holds changed
	status    *account.WalletHoldStatus
	updatedAt time.Time
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

			// update updatedAt when fields change
			updatedHold.updatedAt = afterHold.UpdatedAt

			// track update changes
			updatedHolds = append(updatedHolds, updatedHold)
		}

	}

	changes.newHolds = newHolds
	changes.holdsUpdated = updatedHolds
	changes.expectedVersion = before.Version

	return changes
}
