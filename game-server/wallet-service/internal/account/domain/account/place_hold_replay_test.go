package account

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The bid ID is the caller's idempotency key (ADR-0009). A retry of the same
// hold while it is still RESERVED is a no-op success, not a second hold.
func TestPlaceHold_ReplayOfAReservedHoldIsANoOp(t *testing.T) {
	acc := accountWithGold(t, 1000)
	bidID := uuid.New()
	require.NoError(t, acc.PlaceHold(uuid.New(), 500, bidID, holdExpiry(), time.Now()))

	err := acc.PlaceHold(uuid.New(), 500, bidID, holdExpiry(), time.Now())

	require.NoError(t, err)
	assert.Len(t, acc.Snapshot().WalletHolds, 1)
}

// A hold that is no longer RESERVED backs nothing. Replaying onto it must not
// read as success, or the caller would record a bid with no gold behind it.
func TestPlaceHold_ReplayOntoASpentHoldIsRefused(t *testing.T) {
	acc := accountWithGold(t, 1000)
	bidID := uuid.New()
	require.NoError(t, acc.PlaceHold(uuid.New(), 500, bidID, holdExpiry(), time.Now()))
	require.NoError(t, acc.ReleaseHold(bidID, time.Now()))

	err := acc.PlaceHold(uuid.New(), 500, bidID, holdExpiry(), time.Now())

	assert.ErrorIs(t, err, ErrBidAlreadyHeld)
	assert.Len(t, acc.Snapshot().WalletHolds, 1)
}

// A replay asking for a different amount is not the same hold.
func TestPlaceHold_ReplayWithADifferentAmountIsRefused(t *testing.T) {
	acc := accountWithGold(t, 1000)
	bidID := uuid.New()
	require.NoError(t, acc.PlaceHold(uuid.New(), 500, bidID, holdExpiry(), time.Now()))

	err := acc.PlaceHold(uuid.New(), 600, bidID, holdExpiry(), time.Now())

	assert.ErrorIs(t, err, ErrBidAlreadyHeld)
	assert.Len(t, acc.Snapshot().WalletHolds, 1)
}
