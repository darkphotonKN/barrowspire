package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
)

// CommitHold is step 1b, the pivot. A thin wrapper (FS-NXP1W §Req 7): the rules
// live in the use case and the domain. Classifying failures into retryable and
// non-retryable errors is slice 6's job; until then every failure is returned
// as a plain error.
func (a *Activities) CommitHold(ctx context.Context, in walletactivity.CommitHoldInput) (walletactivity.CommitHoldOutput, error) {
	res, err := a.commitHold.Handle(ctx, &usecase.CommitHoldCommand{
		BidID:          in.WinnerBidID,
		ExpectedAmount: int(in.ExpectedAmount),
		Now:            time.Now(),
	})
	if err != nil {
		return walletactivity.CommitHoldOutput{}, fmt.Errorf("commit hold activity bid id %v: %w", in.WinnerBidID, err)
	}

	return walletactivity.CommitHoldOutput{
		BuyerWalletAccountID: res.AccountID,
		CommittedAmount:      int64(res.Amount),
	}, nil
}
