package account

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPlaceHoldAmountInvariant pins the "amount > 0" hold-birth invariant.
// A zero-gold hold reserves nothing yet would still consume the UNIQUE(bid_id)
// slot for that bid, so it must be rejected the same way a negative one is.
func TestPlaceHoldAmountInvariant(t *testing.T) {
	tests := []struct {
		name    string
		amount  int
		wantErr error
	}{
		{name: "negative amount is rejected", amount: -1, wantErr: ErrInvalidAmount},
		{name: "zero amount is rejected", amount: 0, wantErr: ErrInvalidAmount},
		{name: "positive amount within balance is accepted", amount: 1, wantErr: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := accountWithGold(t, 100)

			err := acc.PlaceHold(uuid.New(), tt.amount, uuid.New(), time.Now())

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, acc.Snapshot().WalletHolds, "a rejected hold must not be appended")
				return
			}

			require.NoError(t, err)
			assert.Len(t, acc.Snapshot().WalletHolds, 1)
		})
	}
}

// TestPlaceHoldLifetimeInvariant covers the balance guard: the sum of RESERVED
// holds can never exceed the account's gold.
func TestPlaceHoldLifetimeInvariant(t *testing.T) {
	t.Run("hold equal to the full balance is allowed", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		require.NoError(t, acc.PlaceHold(uuid.New(), 100, uuid.New(), time.Now()))
	})

	t.Run("hold exceeding the balance is rejected", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		err := acc.PlaceHold(uuid.New(), 101, uuid.New(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
	})

	t.Run("holds accumulate against available gold", func(t *testing.T) {
		acc := accountWithGold(t, 100)
		require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), time.Now()))

		// 60 already reserved, so only 40 remains available
		err := acc.PlaceHold(uuid.New(), 41, uuid.New(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
		assert.Len(t, acc.Snapshot().WalletHolds, 1, "the rejected hold must not be appended")
	})
}

// TestNewHoldIsBornReserved pins the hold FSM's starting state.
func TestNewHoldIsBornReserved(t *testing.T) {
	acc := accountWithGold(t, 100)

	require.NoError(t, acc.PlaceHold(uuid.New(), 10, uuid.New(), time.Now()))

	holds := acc.Snapshot().WalletHolds
	require.Len(t, holds, 1)
	assert.Equal(t, StatusReserved, holds[0].Status)
}

// accountWithGold builds an account holding the given gold. NewAccount always
// starts at 0, so gold is seeded through Reconstitute — the same path the
// repository uses when loading from the database.
func accountWithGold(t *testing.T, gold int) *Account {
	t.Helper()

	acc, err := Reconstitute(ReconstituteParams{
		ID:        uuid.New(),
		MemberID:  uuid.New(),
		Gold:      gold,
		Version:   0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	require.NoError(t, err)

	return acc
}
