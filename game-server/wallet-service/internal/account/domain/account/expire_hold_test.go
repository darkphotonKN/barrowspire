package account

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The hold sweep is the timeout Cancel of a hold's TCC (FS-A3CQH §Req 1, 3): an
// expired RESERVED hold goes back to the bidder. No gold moves; the gold it was
// fencing off becomes available again because availability is derived from the
// RESERVED holds.
func TestExpireHold_ExpiredReservedHold_IsReleased(t *testing.T) {
	acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
	now := expiredAt.Add(time.Minute)

	released, err := acc.ExpireHold(bidID, now)

	require.NoError(t, err)
	assert.True(t, released, "a release must read as one")
	snap := acc.Snapshot()
	assert.Equal(t, StatusReleased, snap.WalletHolds[0].Status)
	assert.Equal(t, now, snap.WalletHolds[0].UpdatedAt)
	assert.Equal(t, now, snap.UpdatedAt)
	assert.Equal(t, 1000, snap.Gold, "a release moves no gold")
	assert.Equal(t, 1000, acc.getAvailableGold(), "the held gold is available again")
}

// The candidate list is advisory and read off another clock (§Req 6), so the
// aggregate decides again. A hold that has not expired is still protecting a bid,
// and the sweep must leave it, and the account, exactly as they were (§Req 3).
func TestExpireHold_NotYetExpired_IsRefusedAndChangesNothing(t *testing.T) {
	acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
	before := acc.Snapshot()

	released, err := acc.ExpireHold(bidID, expiredAt.Add(-time.Minute))

	assert.ErrorIs(t, err, ErrHoldNotExpired)
	assert.False(t, released)
	assert.Equal(t, before, acc.Snapshot(), "the hold and the account must be untouched")
}

// A hold that already left RESERVED is past the sweep's reach (§Req 1, 3). A
// COMMITTED hold is never cancelled after its Confirm: the gold is spent, and
// ADR-0017 leaves no way to put it back. A RELEASED hold is already cancelled, and
// another replica or a later pass reaching it must count it as done (§Req 10).
// Neither is an error, and neither reads as a release, before or after expiry.
func TestExpireHold_SettledHold_IsANoOp(t *testing.T) {
	settle := map[string]func(t *testing.T, acc *Account, bidID uuid.UUID, at time.Time){
		"committed": func(t *testing.T, acc *Account, bidID uuid.UUID, at time.Time) {
			_, err := acc.CommitHold(bidID, 300, at)
			require.NoError(t, err)
		},
		"released by the caller": func(t *testing.T, acc *Account, bidID uuid.UUID, at time.Time) {
			require.NoError(t, acc.ReleaseHold(bidID, at))
		},
		"released by an earlier sweep": func(t *testing.T, acc *Account, bidID uuid.UUID, at time.Time) {
			_, err := acc.ExpireHold(bidID, at.Add(2*time.Hour))
			require.NoError(t, err)
		},
	}
	sweepAt := map[string]time.Duration{
		"before expiry": -time.Minute,
		"after expiry":  time.Minute,
	}

	for settledBy, settleHold := range settle {
		for when, offset := range sweepAt {
			t.Run(settledBy+", swept "+when, func(t *testing.T) {
				acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
				settleHold(t, acc, bidID, expiredAt.Add(-30*time.Minute))
				before := acc.Snapshot()

				released, err := acc.ExpireHold(bidID, expiredAt.Add(offset))

				require.NoError(t, err)
				assert.False(t, released, "a no-op must not read as a release")
				assert.Equal(t, before, acc.Snapshot(), "the hold and the account must be untouched")
			})
		}
	}
}

func TestExpireHold_UnknownBid_ReturnsNotFound(t *testing.T) {
	acc, _, expiredAt := accountWithHold(t, 1000, 300)

	released, err := acc.ExpireHold(uuid.New(), expiredAt.Add(time.Minute))

	assert.ErrorIs(t, err, ErrHoldNotFound)
	assert.False(t, released)
}

// No hanging Try (§Req 1, ADR-0009): a PlaceHold arriving after the Cancel, under
// the same bid id and for the same amount, must not resurrect the hold.
func TestExpireHold_LatePlaceHoldForTheSweptBid_IsRefused(t *testing.T) {
	acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
	sweptAt := expiredAt.Add(time.Minute)
	_, err := acc.ExpireHold(bidID, sweptAt)
	require.NoError(t, err)

	err = acc.PlaceHold(uuid.New(), 300, bidID, sweptAt.Add(time.Hour), sweptAt)

	assert.ErrorIs(t, err, ErrBidAlreadyHeld)
	snap := acc.Snapshot()
	require.Len(t, snap.WalletHolds, 1, "no second hold may be placed")
	assert.Equal(t, StatusReleased, snap.WalletHolds[0].Status)
}

// Confirm and Cancel meet at one boundary, expiredAt (§Req 2). At expiredAt itself
// the hold still protects the bid: a commit lands and the sweep refuses. One
// instant later it no longer does: a commit is refused and the sweep releases. So
// at no instant may both act.
func TestExpireHold_SharesItsBoundaryWithCommitHold(t *testing.T) {
	tests := []struct {
		name         string
		offset       time.Duration
		wantCommit   error
		wantExpire   error
		wantReleased bool
	}{
		{name: "at expiry the commit wins", offset: 0, wantCommit: nil, wantExpire: ErrHoldNotExpired},
		{name: "one instant later the sweep wins", offset: time.Nanosecond, wantCommit: ErrHoldExpired, wantExpire: nil, wantReleased: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := func(expiredAt time.Time) time.Time { return expiredAt.Add(tt.offset) }

			// each verb on its own account, so neither sees the other's effect
			committing, commitBid, expiredAt := accountWithHold(t, 1000, 300)
			_, commitErr := committing.CommitHold(commitBid, 300, now(expiredAt))

			sweeping, sweepBid, expiredAt := accountWithHold(t, 1000, 300)
			released, expireErr := sweeping.ExpireHold(sweepBid, now(expiredAt))

			if tt.wantCommit == nil {
				assert.NoError(t, commitErr)
			} else {
				assert.ErrorIs(t, commitErr, tt.wantCommit)
			}
			if tt.wantExpire == nil {
				assert.NoError(t, expireErr)
			} else {
				assert.ErrorIs(t, expireErr, tt.wantExpire)
			}
			assert.Equal(t, tt.wantReleased, released)
		})
	}
}

// The sweep never changes an auction's outcome (§Req 13, D11). Past expiry a
// commit is refused with ErrHoldExpired whether or not the sweep has run, so
// settlement classifies the failure and rolls back exactly as it would without
// the sweep. It must never surface as ErrInvalidHoldTransition.
func TestExpireHold_CommitAfterExpiry_FailsTheSameWithOrWithoutTheSweep(t *testing.T) {
	acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
	afterExpiry := expiredAt.Add(time.Minute)

	_, errBeforeSweep := acc.CommitHold(bidID, 300, afterExpiry)
	_, err := acc.ExpireHold(bidID, afterExpiry)
	require.NoError(t, err)
	_, errAfterSweep := acc.CommitHold(bidID, 300, afterExpiry.Add(time.Minute))

	assert.ErrorIs(t, errBeforeSweep, ErrHoldExpired)
	assert.ErrorIs(t, errAfterSweep, ErrHoldExpired)
	assert.NotErrorIs(t, errAfterSweep, ErrInvalidHoldTransition)
	assert.Equal(t, 1000, acc.Snapshot().Gold, "no gold may be debited")
}

// Every caller-driven release (ReleaseHold, and ReleaseAllHolds and
// ReleaseLosingHolds, which release through it) reaching a swept hold must
// succeed as a no-op, so settlement's uncapped rollback and step 2 terminate
// (§Req 13).
func TestExpireHold_ReleasingASweptHold_IsANoOp(t *testing.T) {
	acc, bidID, expiredAt := accountWithHold(t, 1000, 300)
	_, err := acc.ExpireHold(bidID, expiredAt.Add(time.Minute))
	require.NoError(t, err)
	before := acc.Snapshot()

	err = acc.ReleaseHold(bidID, expiredAt.Add(time.Hour))

	require.NoError(t, err)
	assert.Equal(t, before, acc.Snapshot(), "the hold and the account must be untouched")
}

// accountWithHold builds an account with the given gold and one RESERVED hold of
// amount, placed an hour before its expiry. It returns the hold's bid id and the
// instant it expires.
func accountWithHold(t *testing.T, gold, amount int) (*Account, uuid.UUID, time.Time) {
	t.Helper()

	acc := accountWithGold(t, gold)
	bidID := uuid.New()
	expiredAt := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	require.NoError(t, acc.PlaceHold(uuid.New(), amount, bidID, expiredAt, expiredAt.Add(-time.Hour)))

	return acc, bidID, expiredAt
}
