package activity

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
)

// CreditSeller is step 3 (FS-NXP1W §Req 30): the sale proceeds reach the seller.
// Part of the tail, so it rolls forward and never undoes anything (ADR-0017). The
// gap between the pivot and this step is the intended escrow window.
func (a *Activities) CreditSeller(ctx context.Context, in walletactivity.CreditSellerInput) (walletactivity.CreditSellerOutput, error) {
	accountID, err := a.creditSeller.Handle(ctx, &usecase.CreditSellerCommand{
		SellerID:       in.SellerID,
		Amount:         int(in.Amount),
		IdempotencyKey: in.IdempotencyKey,
		Now:            time.Now(),
	})
	if err != nil {
		return walletactivity.CreditSellerOutput{}, classifyCreditSellerErr(in.SellerID, err)
	}

	return walletactivity.CreditSellerOutput{SellerWalletAccountID: accountID}, nil
}

// creditSellerImpossible is the type the workflow matches on. Past the pivot it
// means an invariant breach that escalates and parks (§Req 13), never roll back.
const creditSellerImpossible = "CreditSellerImpossible"

// creditSellerNonRetryable is step 3's non-retryable set (§Req 9, ADR-0011).
//
// Small for the same reason step 2's is: the buyer has already paid, so a transient
// failure mislabelled here strands the seller's proceeds behind an operator rather
// than a retry. Wallet being down stays out of it — the default tail policy owns that
// (Edge States, "wallet down after the pivot").
var creditSellerNonRetryable = []error{
	// the seller has no account: the listing named a seller wallet never birthed,
	// and no retry makes one appear
	commonconstants.ErrNotFound,
	// a non-positive amount: the workflow computed the settlement wrong
	account.ErrInvalidGold,
	// no idempotency key: the workflow minted none, and crediting without one
	// would let keyless settlements mask each other in the dedup table
	usecase.ErrMissingIdempotencyKey,
}

func classifyCreditSellerErr(sellerID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("credit seller activity seller id %v: %w", sellerID, err)

	if isAnyOf(err, creditSellerNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),        // message
			creditSellerImpossible, // type, the workflow matches on this
			err,                    // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
