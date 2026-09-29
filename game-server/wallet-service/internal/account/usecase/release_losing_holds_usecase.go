package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// ReleaseLosingHoldsUC is settlement step 2 (FS-NXP1W §Req 29), the first step of the
// tail: the pivot has already spent the winner's gold, so every other bidder's
// reservation goes back.
//
// It rolls forward and never undoes anything. A losing bidder still holding gold is a
// parked settlement, never a failed one.
type ReleaseLosingHoldsUC struct {
	releaser holdReleaser
}

func NewReleaseLosingHoldsUC(repo account.Repository) *ReleaseLosingHoldsUC {
	return &ReleaseLosingHoldsUC{
		releaser: holdReleaser{repo: repo},
	}
}

type ReleaseLosingHoldsCommand struct {
	// WinnerBidID is filtered out of LosingBidIDs rather than trusted to be absent:
	// releasing the winner would hand back gold the pivot already spent
	WinnerBidID  uuid.UUID
	LosingBidIDs []uuid.UUID
	Now          time.Time
}

// Handle returns how many losing holds are released once it returns, which is the
// same answer on a re-run (§Req 9).
func (uc *ReleaseLosingHoldsUC) Handle(ctx context.Context, cmd *ReleaseLosingHoldsCommand) (int, error) {
	losers := make([]uuid.UUID, 0, len(cmd.LosingBidIDs))

	for _, bidID := range cmd.LosingBidIDs {
		// belt and braces. The hold FSM already refuses COMMITTED -> RELEASED, so a
		// winner reaching the loop would fail loudly rather than quietly refund a
		// spent hold — but the workflow decided this set, and a step that rolls
		// forward should not need the FSM to catch a list it was handed wrong
		if bidID == cmd.WinnerBidID {
			continue
		}

		losers = append(losers, bidID)
	}

	released, err := uc.releaser.releaseEach(ctx, losers, cmd.Now)
	if err != nil {
		return released, fmt.Errorf("release losing holds uc handle: %w", err)
	}

	return released, nil
}
