package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAccountRepo serves one account and records what the use case saved. Only
// the methods the settlement commit path uses do anything.
type fakeAccountRepo struct {
	acc *account.Account

	gotBidID uuid.UUID
	saved    *account.AccountSnapshot
}

func (f *fakeAccountRepo) FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error) {
	f.gotBidID = bidID
	return f.acc, nil
}

func (f *fakeAccountRepo) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	snap := acc.Snapshot()
	f.saved = &snap
	return nil
}

func (f *fakeAccountRepo) FindByID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("FindByID is not on the settlement commit path")
}

func (f *fakeAccountRepo) FindByMemberID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("settlement has no member: the hold is found by its bid")
}

func (f *fakeAccountRepo) Insert(context.Context, *account.Account) error {
	return errors.New("Insert is not on the settlement commit path")
}

// accountHolding is an account with 1000 gold and one reserved 300 hold for
// bidID, the state the buyer is in when settlement reaches the pivot.
func accountHolding(t *testing.T, bidID uuid.UUID) *account.Account {
	t.Helper()

	accountID := uuid.New()
	now := time.Now()
	acc, err := account.Reconstitute(account.ReconstituteParams{
		ID:       accountID,
		MemberID: uuid.New(),
		Gold:     1000,
		Holds: []*account.HoldReconstituteParams{{
			ID:        uuid.New(),
			AccountID: accountID,
			BidID:     bidID,
			Status:    account.StatusReserved,
			Amount:    300,
			ExpiredAt: now.Add(time.Hour),
			CreatedAt: now,
			UpdatedAt: now,
		}},
		CreatedAt: now,
		UpdatedAt: now,
	})
	require.NoError(t, err)

	return acc
}

func TestCommitHoldUC_CommitsTheHoldFoundByItsBid(t *testing.T) {
	bidID := uuid.New()
	acc := accountHolding(t, bidID)
	repo := &fakeAccountRepo{acc: acc}

	res, err := usecase.NewCommitHoldUC(repo).Handle(context.Background(), &usecase.CommitHoldCommand{
		BidID:          bidID,
		ExpectedAmount: 300,
		Now:            time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, bidID, repo.gotBidID)
	assert.Equal(t, acc.Snapshot().ID, res.AccountID)
	assert.Equal(t, 300, res.Amount)
	require.NotNil(t, repo.saved, "the commit must be persisted")
	assert.Equal(t, 700, repo.saved.Gold)
	assert.Equal(t, account.StatusCommitted, repo.saved.WalletHolds[0].Status)
}

// A retried activity reaching an already committed hold gets the same output as
// the first application — the workflow cannot tell them apart — and moves no
// more gold (FS-NXP1W §Req 28).
func TestCommitHoldUC_Retry_ReturnsTheSameResult(t *testing.T) {
	bidID := uuid.New()
	acc := accountHolding(t, bidID)
	repo := &fakeAccountRepo{acc: acc}
	uc := usecase.NewCommitHoldUC(repo)
	cmd := &usecase.CommitHoldCommand{BidID: bidID, ExpectedAmount: 300, Now: time.Now()}

	first, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)

	second, err := uc.Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.Equal(t, first, second)
	assert.Equal(t, 700, acc.Snapshot().Gold, "the retry must not debit again")
}

// Slice 6 classifies the pivot's failures by kind, so a refusal must reach the
// caller with its domain sentinel intact — and must persist nothing.
func TestCommitHoldUC_Refusal_KeepsItsSentinelAndSavesNothing(t *testing.T) {
	bidID := uuid.New()
	repo := &fakeAccountRepo{acc: accountHolding(t, bidID)}

	_, err := usecase.NewCommitHoldUC(repo).Handle(context.Background(), &usecase.CommitHoldCommand{
		BidID:          bidID,
		ExpectedAmount: 300,
		Now:            time.Now().Add(2 * time.Hour), // past the hold's expiry
	})

	assert.ErrorIs(t, err, account.ErrHoldExpired)
	assert.Nil(t, repo.saved)
}
