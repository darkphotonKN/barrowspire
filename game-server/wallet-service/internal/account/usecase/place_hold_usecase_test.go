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

// memberAccountRepo serves the bidder's account by member, the way PlaceHold
// finds it, and records what was saved.
type memberAccountRepo struct {
	acc   *account.Account
	saved *account.AccountSnapshot
}

func (f *memberAccountRepo) FindByMemberID(context.Context, uuid.UUID) (*account.Account, error) {
	return f.acc, nil
}

func (f *memberAccountRepo) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	snap := acc.Snapshot()
	f.saved = &snap
	return nil
}

func (f *memberAccountRepo) FindByID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("not on the place hold path")
}

func (f *memberAccountRepo) FindByBidID(context.Context, uuid.UUID) (*account.Account, error) {
	return nil, errors.New("not on the place hold path")
}

func (f *memberAccountRepo) Insert(context.Context, *account.Account) error {
	return errors.New("not on the place hold path")
}

func TestPlaceHoldUC_HoldsWithTheExpiryItWasGiven(t *testing.T) {
	now := time.Now()
	acc, err := account.Reconstitute(account.ReconstituteParams{
		ID: uuid.New(), MemberID: uuid.New(), Gold: 1000, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	repo := &memberAccountRepo{acc: acc}
	bidID := uuid.New()
	expiresAt := now.Add(26 * time.Hour)

	err = usecase.NewPlaceHoldUC(repo).Handle(context.Background(), &usecase.PlaceHoldCommand{
		MemberID:  uuid.New(),
		BidID:     bidID,
		Gold:      300,
		ExpiresAt: expiresAt,
	})

	require.NoError(t, err)
	require.NotNil(t, repo.saved)
	require.Len(t, repo.saved.WalletHolds, 1)
	hold := repo.saved.WalletHolds[0]
	assert.Equal(t, bidID, hold.BidID)
	assert.Equal(t, expiresAt, hold.ExpiredAt)
	assert.Equal(t, repo.saved.ID, hold.AccountID)
}
