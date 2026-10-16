package settlement

import (
	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

const WorkflowName = "SettleAuction"

type Input struct {
	ListingID uuid.UUID           `json:"listing_id"`
	Trigger   usecase.TriggerKind `json:"trigger"`
}

// FS NXP1W Settlement Saga
func Workflow(ctx workflow.Context, in Input) (marketplaceactivity.FreezeListingOutput, error) {
	// declare our own variables, temporal makes them durable because of event history
	var frozen marketplaceactivity.FreezeListingOutput

	// Step 0a. An outage parks; an impossibility froze nothing, so its rollback
	// knows no item (§Req 12).
	err := runUntilDone(ctx, in.ListingID,
		marketplaceactivity.FreezeListingActivityName,
		bstemporal.QueueMarketplace,
		beforePivot,
		marketplaceactivity.FreezeListingInput{ListingID: in.ListingID},
		&frozen,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, beforePivotFailure(ctx, in.ListingID, marketplaceactivity.FreezeListingActivityName, err, nil)
	}

	if frozen.Outcome == marketplaceactivity.OutcomeNoBids {
		returnItemsCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueItems))

		// Step NB1
		err := workflow.ExecuteActivity(returnItemsCtx,
			itemsactivity.ReturnItemActivityName,
			itemsactivity.ReturnItemInput{ItemID: frozen.ItemID, ListingID: frozen.ListingID},
		).Get(returnItemsCtx, nil)
		if err != nil {
			return marketplaceactivity.FreezeListingOutput{}, err
		}

		// Step NB2, only once NB1 has returned the item (§Req 34b). The item is
		// already back with its seller, so there is nothing to roll back: an
		// impossible NB2 is an invariant breach that escalates and parks, the same
		// as an outage, and the run never fails here.
		err = runUntilDone(ctx, frozen.ListingID,
			marketplaceactivity.ExpireListingActivityName,
			bstemporal.QueueMarketplace,
			afterPivot, // an impossible NB2 parks: nothing left to roll back
			marketplaceactivity.ExpireListingInput{ListingID: frozen.ListingID},
			nil,
		)
		if err != nil {
			return marketplaceactivity.FreezeListingOutput{}, err
		}

		// TODO: update to a workflow specific response wrapper later
		return frozen, nil
	}

	// Step 0b. An outage parks; an item that left its seller rolls back (§Req 12).
	err = runUntilDone(ctx, frozen.ListingID,
		itemsactivity.FreezeItemActivityName,
		bstemporal.QueueItems,
		beforePivot,
		itemsactivity.FreezeItemInput{ItemID: frozen.ItemID, SellerID: frozen.SellerID},
		nil,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, beforePivotFailure(ctx, frozen.ListingID, itemsactivity.FreezeItemActivityName, err, &frozen)
	}

	// Step 1a
	err = runUntilDone(ctx, frozen.ListingID,
		marketplaceactivity.SetWinningBidActivityName,
		bstemporal.QueueMarketplace,
		beforePivot,
		marketplaceactivity.SetWinningBidInput{ListingID: frozen.ListingID, WinnerBidID: frozen.WinnerBidID},
		nil,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, beforePivotFailure(ctx, frozen.ListingID, marketplaceactivity.SetWinningBidActivityName, err, &frozen)
	}

	// Step 1b, pivot. A failed CommitHold moved no gold: the pivot is its success,
	// so rolling back is still legal (ADR-0010).
	//
	// That rests on wallet's Account.CommitHold answering COMMITTED as success
	// before any check that can fail non-retryably (expiry), pinned by wallet's
	// TestCommitHold_Expiry "a hold committed in time stays already applied after
	// expiry" and TestCommitHold_AlreadyCommitted_ReturnsSameAmountWithoutMovingGold. If a
	// committed hold could ever come back impossible, the rollback's ReleaseAllHolds
	// would meet a hold the FSM refuses to release and retry it without end.
	var committed walletactivity.CommitHoldOutput
	err = runUntilDone(ctx, frozen.ListingID,
		walletactivity.CommitHoldActivityName,
		bstemporal.QueueWallet,
		beforePivot,
		walletactivity.CommitHoldInput{WinnerBidID: frozen.WinnerBidID, ExpectedAmount: frozen.Amount},
		&committed,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, beforePivotFailure(ctx, frozen.ListingID, walletactivity.CommitHoldActivityName, err, &frozen)
	}

	// Past the pivot the buyer has paid, so every step rolls forward: an outage or
	// an impossibility escalates and parks, and the run never fails (§Req 13, 14).

	// Step 2. Every bid 0a found: wallet filters the winner out itself.
	err = runUntilDone(ctx, frozen.ListingID,
		walletactivity.ReleaseLosingHoldsActivityName,
		bstemporal.QueueWallet,
		afterPivot,
		walletactivity.ReleaseLosingHoldsInput{ListingID: frozen.ListingID, WinnerBidID: frozen.WinnerBidID, LosingBidIDs: frozen.BidIDs},
		nil,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// Step 3. The credit has no prior state to make it idempotent, so wallet dedups
	// on a key the workflow mints (ADR-0009): workflow ID plus activity name, the
	// same on every retry, park and replay of this settlement.
	var credited walletactivity.CreditSellerOutput
	err = runUntilDone(ctx, frozen.ListingID,
		walletactivity.CreditSellerActivityName,
		bstemporal.QueueWallet,
		afterPivot,
		walletactivity.CreditSellerInput{
			SellerID:       frozen.SellerID,
			Amount:         frozen.Amount,
			IdempotencyKey: workflow.GetInfo(ctx).WorkflowExecution.ID + ":" + walletactivity.CreditSellerActivityName,
		},
		&credited,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// Step 4
	err = runUntilDone(ctx, frozen.ListingID,
		itemsactivity.TransferItemActivityName,
		bstemporal.QueueItems,
		afterPivot,
		itemsactivity.TransferItemInput{ItemID: frozen.ItemID, BuyerMemberID: frozen.WinnerMemberID, ListingID: frozen.ListingID},
		nil,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// TODO(I-NXP1W-12): Step 5 AppendLedgerTx goes here, on the ledger queue, once
	// ledger registers the activity (I-F9R7Q-5). A two-leg SETTLEMENT transaction
	// for frozen.Amount, reference frozen.ListingID: buyer DEBIT on
	// committed.BuyerWalletAccountID, seller CREDIT on credited.SellerWalletAccountID,
	// transaction_id = uuidv5(settlement namespace, "settlement:" + listingId).
	// Inserting it here changes the command sequence, so any run that is open past
	// step 4 by then needs it behind workflow.GetVersion.

	// Step 6
	err = runUntilDone(ctx, frozen.ListingID,
		marketplaceactivity.MarkSoldActivityName,
		bstemporal.QueueMarketplace,
		afterPivot,
		marketplaceactivity.MarkSoldInput{ListingID: frozen.ListingID},
		nil,
	)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// TODO: update to a workflow specific response wrapper later
	return frozen, nil
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
