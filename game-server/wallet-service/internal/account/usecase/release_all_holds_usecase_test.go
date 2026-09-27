package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// multiAccountRepo serves one account per bid, which is the shape the rollback
// actually meets: holds on one listing belong to different bidders, so each is its
// own aggregate with its own version.
type multiAccountRepo struct {
	byBid   map[uuid.UUID]*account.Account
	findErr error

	lookups []uuid.UUID
	saves   int
}

func (f *multiAccountRepo) FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error) {
	f.lookups = append(f.lookups, bidID)

	if f.findErr != nil {
		return nil, f.findErr
	}

	acc, ok := f.byBid[bidID]
	if !ok {
		// what the real repository returns: WrapDBErr maps sql.ErrNoRows from the
		// wallet_holds lookup onto this sentinel
		return nil, commonconstants.ErrNotFound
	}

	return acc, nil
}

func (f *multiAccountRepo) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	f.saves++
	return nil
}

func (f *multiAccountRepo) FindByID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("FindByID is not on the rollback path")
}

func (f *multiAccountRepo) FindByMemberID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("the rollback has no member: holds are found by their bid")
}

func (f *multiAccountRepo) Insert(context.Context, *account.Account) error {
	return errors.New("Insert is not on the rollback path")
}

// Every bidder's gold goes back, the winner's included: before the pivot nothing has
// been spent, so there is no hold the rollback may leave reserved (FS-NXP1W §Req 12).
func TestReleaseAllHoldsUC_ReleasesEveryNamedHold(t *testing.T) {
	winner, loser := uuid.New(), uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		winner: accountHolding(t, winner),
		loser:  accountHolding(t, loser),
	}}

	err := usecase.NewReleaseAllHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseAllHoldsCommand{
		BidIDs: []uuid.UUID{winner, loser},
		Now:    time.Now(),
	})

	require.NoError(t, err)
	assert.ElementsMatch(t, []uuid.UUID{winner, loser}, repo.lookups, "each bid is resolved to its own account")
	assert.Equal(t, 2, repo.saves, "one save per aggregate, each under its own version check")

	for bidID, acc := range repo.byBid {
		holds := acc.Snapshot().WalletHolds
		require.Len(t, holds, 1, "bid %s", bidID)
		assert.Equal(t, account.StatusReleased, holds[0].Status, "bid %s", bidID)
		assert.Equal(t, 1000, acc.Snapshot().Gold, "a release moves no gold, bid %s", bidID)
	}
}

// The rollback is retried without a cap, so re-running it must be a no-op rather
// than an error the workflow would treat as a step still failing.
func TestReleaseAllHoldsUC_RerunAfterSuccess_IsANoOp(t *testing.T) {
	bidID := uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{bidID: accountHolding(t, bidID)}}
	uc := usecase.NewReleaseAllHoldsUC(repo)
	cmd := &usecase.ReleaseAllHoldsCommand{BidIDs: []uuid.UUID{bidID}, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd))

	assert.Equal(t, account.StatusReleased, repo.byBid[bidID].Snapshot().WalletHolds[0].Status)
}

// A rollback that stops halfway must say which bid it stopped on. The step is retried
// from the beginning, so the ones already released are no-ops on the next pass — but
// an error naming nothing leaves an operator with no idea where the gold is stuck.
func TestReleaseAllHoldsUC_FailureNamesTheBidItStoppedOn(t *testing.T) {
	bidID := uuid.New()
	repo := &multiAccountRepo{findErr: errors.New("dial tcp: connection refused")}

	err := usecase.NewReleaseAllHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseAllHoldsCommand{
		BidIDs: []uuid.UUID{bidID},
		Now:    time.Now(),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), bidID.String())
}

// A bid whose gold was never held has no wallet_holds row at all — FailBidUC exists
// for exactly that outcome. The rollback releases every bid on the listing, so such a
// bid is ordinary input, not corruption.
//
// This is the case that makes the step's uncapped retry dangerous rather than safe: a
// lookup that can never succeed, retried without a deadline, wedges the rollback
// forever and leaves the other bidders' gold reserved — the outcome uncapped retry was
// chosen to prevent.
func TestReleaseAllHoldsUC_BidWithNoHold_IsNothingToRelease(t *testing.T) {
	held, neverHeld := uuid.New(), uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		held: accountHolding(t, held),
	}}

	err := usecase.NewReleaseAllHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseAllHoldsCommand{
		BidIDs: []uuid.UUID{held, neverHeld},
		Now:    time.Now(),
	})

	require.NoError(t, err, "the rollback must complete, not retry a lookup that can never succeed")
	assert.Equal(t, account.StatusReleased, repo.byBid[held].Snapshot().WalletHolds[0].Status,
		"the holds that do exist still go back")
}
