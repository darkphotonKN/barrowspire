package usecase_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Step 2 is the first step of the tail (FS-NXP1W §Req 29): the pivot already spent
// the winner's gold, so every OTHER bidder's reservation goes back and the winner's
// committed hold must not be touched.
func TestReleaseLosingHoldsUC_ReleasesEveryLoserAndLeavesTheWinner(t *testing.T) {
	winner, loserA, loserB := uuid.New(), uuid.New(), uuid.New()

	winnerAcc := accountHolding(t, winner)
	_, err := winnerAcc.CommitHold(winner, 300, time.Now()) // the pivot already ran
	require.NoError(t, err)

	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		winner: winnerAcc,
		loserA: accountHolding(t, loserA),
		loserB: accountHolding(t, loserB),
	}}

	released, err := usecase.NewReleaseLosingHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseLosingHoldsCommand{
		WinnerBidID:  winner,
		LosingBidIDs: []uuid.UUID{loserA, loserB},
		Now:          time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 2, released, "both losing holds went back")

	for _, loser := range []uuid.UUID{loserA, loserB} {
		assert.Equal(t, account.StatusReleased, repo.byBid[loser].Snapshot().WalletHolds[0].Status)
		assert.Equal(t, 1000, repo.byBid[loser].Snapshot().Gold, "a release moves no gold")
	}

	winnerSnap := winnerAcc.Snapshot()
	assert.Equal(t, account.StatusCommitted, winnerSnap.WalletHolds[0].Status, "the winner's hold stays committed")
	assert.Equal(t, 700, winnerSnap.Gold, "the winner's gold stays spent")
}

// Req 9 says an already-applied step returns "the same output the first application
// would give", and AC 2 says a re-run returns the same count. So the count is how
// many losing holds ARE released, not how many this call moved — otherwise a retry
// after a crash reports 0 and the workflow records that a settlement released
// nothing, for a settlement that released everything.
func TestReleaseLosingHoldsUC_Rerun_ReportsTheSameCount(t *testing.T) {
	loserA, loserB := uuid.New(), uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		loserA: accountHolding(t, loserA),
		loserB: accountHolding(t, loserB),
	}}
	uc := usecase.NewReleaseLosingHoldsUC(repo)
	cmd := &usecase.ReleaseLosingHoldsCommand{
		WinnerBidID:  uuid.New(),
		LosingBidIDs: []uuid.UUID{loserA, loserB},
		Now:          time.Now(),
	}

	first, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)

	second, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)

	assert.Equal(t, 2, first)
	assert.Equal(t, first, second, "the retry catching up reports what the first application did")
}

// A losing bid whose gold was never held has no hold row, so there is nothing to
// release and nothing to count. It must not stop the step: the tail rolls forward
// and a losing bidder still holding gold is the only outcome step 2 may not reach.
func TestReleaseLosingHoldsUC_LoserWithNoHold_IsSkippedNotCounted(t *testing.T) {
	held, neverHeld := uuid.New(), uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		held: accountHolding(t, held),
	}}

	released, err := usecase.NewReleaseLosingHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseLosingHoldsCommand{
		WinnerBidID:  uuid.New(),
		LosingBidIDs: []uuid.UUID{held, neverHeld},
		Now:          time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, released, "only the hold that existed is counted")
}

// The winner is filtered out even when the workflow hands it over in the losing set.
// Without the filter the FSM would still refuse COMMITTED -> RELEASED, but the step
// would fail instead of rolling forward — and the tail must not fail.
func TestReleaseLosingHoldsUC_WinnerInTheLosingSet_IsIgnored(t *testing.T) {
	winner := uuid.New()
	winnerAcc := accountHolding(t, winner)
	_, err := winnerAcc.CommitHold(winner, 300, time.Now())
	require.NoError(t, err)

	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{winner: winnerAcc}}

	released, err := usecase.NewReleaseLosingHoldsUC(repo).Handle(context.Background(), &usecase.ReleaseLosingHoldsCommand{
		WinnerBidID:  winner,
		LosingBidIDs: []uuid.UUID{winner},
		Now:          time.Now(),
	})

	require.NoError(t, err, "a wrong list must not fail the tail")
	assert.Equal(t, 0, released)
	assert.Equal(t, account.StatusCommitted, winnerAcc.Snapshot().WalletHolds[0].Status)
	assert.Equal(t, 700, winnerAcc.Snapshot().Gold)
}
