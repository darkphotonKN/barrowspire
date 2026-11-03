package settlement

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/ledgeractivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"
)

// noBidsArm records what the no-bids arm's fakes were asked to do, in order, so a
// test can prove NB2 only ever runs after NB1.
type noBidsArm struct {
	calls       []string
	returnIn    itemsactivity.ReturnItemInput
	returnQueue string
	returnErr   error
	expireIn    marketplaceactivity.ExpireListingInput
	expireQueue string
	expireErr   error

	// escalate and park: a raise stands for the operator fixing the cause, so
	// it clears returnErr and expireErr and the next lap gets through
	raised   []marketplaceactivity.RaiseSettlementExceptionInput
	resolved []uuid.UUID
}

// The workflow schedules each step by its contract name, so the test stands fakes
// in under those same names. Only the name and signature matter here; the real
// activities are tested in their owning packages.
func newWorkflowEnv(t *testing.T, freeze func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error)) (*testsuite.TestWorkflowEnvironment, *noBidsArm) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(freeze, activity.RegisterOptions{Name: marketplaceactivity.FreezeListingActivityName})

	arm := &noBidsArm{}
	env.RegisterActivityWithOptions(func(ctx context.Context, in itemsactivity.ReturnItemInput) error {
		arm.calls = append(arm.calls, itemsactivity.ReturnItemActivityName)
		arm.returnIn = in
		arm.returnQueue = activity.GetInfo(ctx).TaskQueue
		return arm.returnErr
	}, activity.RegisterOptions{Name: itemsactivity.ReturnItemActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.ExpireListingInput) error {
		arm.calls = append(arm.calls, marketplaceactivity.ExpireListingActivityName)
		arm.expireIn = in
		arm.expireQueue = activity.GetInfo(ctx).TaskQueue
		return arm.expireErr
	}, activity.RegisterOptions{Name: marketplaceactivity.ExpireListingActivityName})

	exceptionID := uuid.New()
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.RaiseSettlementExceptionInput) (marketplaceactivity.RaiseSettlementExceptionOutput, error) {
		arm.raised = append(arm.raised, in)
		arm.returnErr = nil
		arm.expireErr = nil
		return marketplaceactivity.RaiseSettlementExceptionOutput{ExceptionID: exceptionID}, nil
	}, activity.RegisterOptions{Name: marketplaceactivity.RaiseSettlementExceptionActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.ResolveSettlementExceptionInput) error {
		arm.resolved = append(arm.resolved, in.ExceptionID)
		return nil
	}, activity.RegisterOptions{Name: marketplaceactivity.ResolveSettlementExceptionActivityName})

	return env, arm
}

func TestWorkflow_FreezesTheListingOnTheMarketplaceQueue(t *testing.T) {
	listingID := uuid.New()
	frozen := marketplaceactivity.FreezeListingOutput{
		Outcome:   marketplaceactivity.OutcomeNoBids,
		ListingID: listingID,
	}

	var gotIn marketplaceactivity.FreezeListingInput
	var gotQueue string
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		gotIn = in
		gotQueue = activity.GetInfo(ctx).TaskQueue
		return frozen, nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, listingID, gotIn.ListingID)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), gotQueue)

	// Temporary return value (see workflow.go); only checked loosely.
	var out marketplaceactivity.FreezeListingOutput
	require.NoError(t, env.GetWorkflowResult(&out))
	assert.Equal(t, listingID, out.ListingID)
}

// Zero bids (FS-NXP1W §Req 8, 34a, 34b): the item goes back to its seller, then
// the listing expires. Nothing else runs, so no wallet, ledger or bid step is even
// registered here; scheduling one would fail the run.
func TestWorkflow_NoBids_ReturnsTheItemThenExpiresTheListing(t *testing.T) {
	listingID, itemID := uuid.New(), uuid.New()
	env, arm := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{
			Outcome:   marketplaceactivity.OutcomeNoBids,
			ListingID: listingID,
			ItemID:    itemID,
		}, nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, []string{itemsactivity.ReturnItemActivityName, marketplaceactivity.ExpireListingActivityName}, arm.calls)
	assert.Equal(t, itemsactivity.ReturnItemInput{ItemID: itemID, ListingID: listingID}, arm.returnIn,
		"NB1 carries the listing ID that guards a retry against a relist (§Req 24a)")
	assert.Equal(t, bstemporal.QueueItems.String(), arm.returnQueue)
	assert.Equal(t, listingID, arm.expireIn.ListingID)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), arm.expireQueue)
	assert.Empty(t, arm.raised, "zero bids is a normal outcome, not an exception")
}

// NB1 escalates and parks like every step (§Req 10). The no-bids arm has nothing
// to roll back, so an items outage and an impossible NB1 both park, and the run
// completes once the cause is fixed rather than failing. NB2 waits for NB1.
func TestWorkflow_NoBids_ReturnItemFails_ParksThenCompletes(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{"items outage", errors.New("dial tcp: connection refused")},
		{"impossible", temporal.NewNonRetryableApplicationError("item corrupted", "ReturnItemImpossible", nil)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			listingID, itemID := uuid.New(), uuid.New()
			env, arm := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
				return marketplaceactivity.FreezeListingOutput{Outcome: marketplaceactivity.OutcomeNoBids, ListingID: listingID, ItemID: itemID}, nil
			})
			arm.returnErr = tt.err

			env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

			require.True(t, env.IsWorkflowCompleted())
			require.NoError(t, env.GetWorkflowError(), "a failing NB1 parks; it never fails the run")
			require.Len(t, arm.raised, 1)
			assert.Equal(t, listingID, arm.raised[0].ListingID)
			assert.Equal(t, itemsactivity.ReturnItemActivityName, arm.raised[0].Step)
			assert.Len(t, arm.resolved, 1, "the exception is resolved once NB1 gets through")
			assert.Equal(t, marketplaceactivity.ExpireListingActivityName, arm.calls[len(arm.calls)-1], "NB2 runs once, after NB1")
			assert.Equal(t, 1, countOf(arm.calls, marketplaceactivity.ExpireListingActivityName))
			assert.Equal(t, bstemporal.QueueItems.String(), arm.returnQueue)
		})
	}
}

// A listing NB2 finds in any other status is an invariant breach (§Req 34b). The
// item is already back with its seller, so there is nothing to roll back: it
// escalates and parks (I-NXP1W-7), and the run completes once the cause is fixed
// rather than failing.
func TestWorkflow_NoBids_ExpireImpossible_ParksThenCompletes(t *testing.T) {
	listingID := uuid.New()
	env, arm := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{Outcome: marketplaceactivity.OutcomeNoBids, ListingID: in.ListingID}, nil
	})
	arm.expireErr = temporal.NewNonRetryableApplicationError("listing sold", "ExpireListingImpossible", nil)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError(), "an impossible NB2 parks; it never fails the run")

	require.Len(t, arm.raised, 1)
	assert.Equal(t, listingID, arm.raised[0].ListingID)
	assert.Equal(t, marketplaceactivity.ExpireListingActivityName, arm.raised[0].Step)
	assert.Len(t, arm.resolved, 1, "the exception is resolved once NB2 gets through")
	assert.Equal(t, []string{
		itemsactivity.ReturnItemActivityName,
		marketplaceactivity.ExpireListingActivityName, // impossible: raise and park
		marketplaceactivity.ExpireListingActivityName, // after the re-park timer
	}, arm.calls, "NB1 is not repeated; only the parked step is retried")
}

// freezeArm records what the winner arm's 0b and the pre-pivot rollback were asked
// to do, in order, and on which queue each ran.
type freezeArm struct {
	calls  []string
	queues map[string]string

	freezeItemErr error
	// markFailedErrs is consumed one per attempt: a rollback action failing
	// transiently before it lands
	markFailedErrs []error

	markFailedIn  marketplaceactivity.MarkSettlementFailedInput
	loseAllIn     marketplaceactivity.LoseAllBidsInput
	releaseAllIn  walletactivity.ReleaseAllHoldsInput
	unfreezeIn    itemsactivity.UnfreezeItemInput
	setWinningErr error
	commitHoldErr error
	// releaseAllErrs is consumed one per attempt, like markFailedErrs
	releaseAllErrs []error

	// the tail, past the pivot. tailErrs is keyed by step and consumed one per
	// attempt, like markFailedErrs.
	tailErrs        map[string][]error
	releaseLosingIn walletactivity.ReleaseLosingHoldsInput
	creditIns       []walletactivity.CreditSellerInput
	creditRunID     string
	transferIn      itemsactivity.TransferItemInput
	// the wallet account IDs CommitHold and CreditSeller hand back, which step 5
	// must pass to the ledger legs as they are (§Req 18)
	buyerAccountID  uuid.UUID
	sellerAccountID uuid.UUID
	// ledgerIns records every AppendLedgerTx attempt; ledgerErr fails each one
	// until cleared, standing in for the ledger being down
	ledgerIns  []ledgeractivity.AppendLedgerTxInput
	ledgerErr  error
	markSoldIn marketplaceactivity.MarkSoldInput
}

func (a *freezeArm) record(ctx context.Context, name string) {
	a.calls = append(a.calls, name)
	a.queues[name] = activity.GetInfo(ctx).TaskQueue
}

func (a *freezeArm) tailErr(name string) error {
	errs := a.tailErrs[name]
	if len(errs) == 0 {
		return nil
	}
	a.tailErrs[name] = errs[1:]
	return errs[0]
}

// registerFreezeArm stands fakes in for 0b and the rollback actions. Nothing past
// 0b is registered: a settlement that rolls back must never reach 1a, and
// scheduling it would fail the run on an unregistered activity.
func registerFreezeArm(env *testsuite.TestWorkflowEnvironment, arm *freezeArm) {
	arm.queues = map[string]string{}
	env.RegisterActivityWithOptions(func(ctx context.Context, in itemsactivity.FreezeItemInput) error {
		arm.record(ctx, itemsactivity.FreezeItemActivityName)
		return arm.freezeItemErr
	}, activity.RegisterOptions{Name: itemsactivity.FreezeItemActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.MarkSettlementFailedInput) error {
		arm.record(ctx, marketplaceactivity.MarkSettlementFailedActivityName)
		arm.markFailedIn = in
		if len(arm.markFailedErrs) > 0 {
			err := arm.markFailedErrs[0]
			arm.markFailedErrs = arm.markFailedErrs[1:]
			return err
		}
		return nil
	}, activity.RegisterOptions{Name: marketplaceactivity.MarkSettlementFailedActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.LoseAllBidsInput) error {
		arm.record(ctx, marketplaceactivity.LoseAllBidsActivityName)
		arm.loseAllIn = in
		return nil
	}, activity.RegisterOptions{Name: marketplaceactivity.LoseAllBidsActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in walletactivity.ReleaseAllHoldsInput) error {
		arm.record(ctx, walletactivity.ReleaseAllHoldsActivityName)
		arm.releaseAllIn = in
		if len(arm.releaseAllErrs) > 0 {
			err := arm.releaseAllErrs[0]
			arm.releaseAllErrs = arm.releaseAllErrs[1:]
			return err
		}
		return nil
	}, activity.RegisterOptions{Name: walletactivity.ReleaseAllHoldsActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in itemsactivity.UnfreezeItemInput) error {
		arm.record(ctx, itemsactivity.UnfreezeItemActivityName)
		arm.unfreezeIn = in
		return nil
	}, activity.RegisterOptions{Name: itemsactivity.UnfreezeItemActivityName})
}

// registerPivotArm stands fakes in for 1a and 1b on top of registerFreezeArm.
// Nothing past 1b is registered, for the same reason.
func registerPivotArm(env *testsuite.TestWorkflowEnvironment, arm *freezeArm) {
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.SetWinningBidInput) error {
		arm.record(ctx, marketplaceactivity.SetWinningBidActivityName)
		return arm.setWinningErr
	}, activity.RegisterOptions{Name: marketplaceactivity.SetWinningBidActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in walletactivity.CommitHoldInput) (walletactivity.CommitHoldOutput, error) {
		arm.record(ctx, walletactivity.CommitHoldActivityName)
		return walletactivity.CommitHoldOutput{BuyerWalletAccountID: arm.buyerAccountID}, arm.commitHoldErr
	}, activity.RegisterOptions{Name: walletactivity.CommitHoldActivityName})
}

// registerTailArm stands fakes in for the steps past the pivot, on top of
// registerPivotArm, including step 5 AppendLedgerTx under ledger's contract name.
// The real activity and its no-op-on-duplicate behaviour belong to ledger-service
// (FS-F9R7Q); this fake only records what the saga asked for.
func registerTailArm(env *testsuite.TestWorkflowEnvironment, arm *freezeArm) {
	if arm.tailErrs == nil {
		arm.tailErrs = map[string][]error{}
	}
	if arm.buyerAccountID == uuid.Nil {
		arm.buyerAccountID = uuid.New()
	}
	if arm.sellerAccountID == uuid.Nil {
		arm.sellerAccountID = uuid.New()
	}
	env.RegisterActivityWithOptions(func(ctx context.Context, in walletactivity.ReleaseLosingHoldsInput) (walletactivity.ReleaseLosingHoldsOutput, error) {
		arm.record(ctx, walletactivity.ReleaseLosingHoldsActivityName)
		arm.releaseLosingIn = in
		return walletactivity.ReleaseLosingHoldsOutput{}, arm.tailErr(walletactivity.ReleaseLosingHoldsActivityName)
	}, activity.RegisterOptions{Name: walletactivity.ReleaseLosingHoldsActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in walletactivity.CreditSellerInput) (walletactivity.CreditSellerOutput, error) {
		arm.record(ctx, walletactivity.CreditSellerActivityName)
		arm.creditIns = append(arm.creditIns, in)
		arm.creditRunID = activity.GetInfo(ctx).WorkflowExecution.ID
		return walletactivity.CreditSellerOutput{SellerWalletAccountID: arm.sellerAccountID}, arm.tailErr(walletactivity.CreditSellerActivityName)
	}, activity.RegisterOptions{Name: walletactivity.CreditSellerActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in itemsactivity.TransferItemInput) (itemsactivity.TransferItemOutput, error) {
		arm.record(ctx, itemsactivity.TransferItemActivityName)
		arm.transferIn = in
		return itemsactivity.TransferItemOutput{}, arm.tailErr(itemsactivity.TransferItemActivityName)
	}, activity.RegisterOptions{Name: itemsactivity.TransferItemActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in ledgeractivity.AppendLedgerTxInput) (ledgeractivity.AppendLedgerTxOutput, error) {
		arm.record(ctx, ledgeractivity.AppendLedgerActivityName)
		arm.ledgerIns = append(arm.ledgerIns, in)
		if arm.ledgerErr != nil {
			return ledgeractivity.AppendLedgerTxOutput{}, arm.ledgerErr
		}
		return ledgeractivity.AppendLedgerTxOutput{Applied: true}, arm.tailErr(ledgeractivity.AppendLedgerActivityName)
	}, activity.RegisterOptions{Name: ledgeractivity.AppendLedgerActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.MarkSoldInput) error {
		arm.record(ctx, marketplaceactivity.MarkSoldActivityName)
		arm.markSoldIn = in
		return arm.tailErr(marketplaceactivity.MarkSoldActivityName)
	}, activity.RegisterOptions{Name: marketplaceactivity.MarkSoldActivityName})
}

func hasWinner(listingID, itemID, sellerID uuid.UUID) marketplaceactivity.FreezeListingOutput {
	winnerBidID := uuid.New()
	return marketplaceactivity.FreezeListingOutput{
		Outcome:        marketplaceactivity.OutcomeHasWinner,
		ListingID:      listingID,
		ItemID:         itemID,
		SellerID:       sellerID,
		WinnerBidID:    winnerBidID,
		WinnerMemberID: uuid.New(),
		Amount:         200,
		BidIDs:         []uuid.UUID{uuid.New(), winnerBidID},
	}
}

// A 0b that can never succeed — the item left its seller, or was unfrozen —
// rolls back (FS-NXP1W §Req 12, Edge States "Item owner changed"): the
// exception is recorded, the listing ends SETTLEMENT_FAILED, every bid ends LOST
// and the item goes back to its seller for this listing. The run then fails, so it stands out in
// the Temporal UI, and never reaches 1a.
func TestWorkflow_FreezeItemImpossible_RollsBackAndFails(t *testing.T) {
	listingID, itemID, sellerID := uuid.New(), uuid.New(), uuid.New()
	frozen := hasWinner(listingID, itemID, sellerID)
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return frozen, nil
	})
	arm := &freezeArm{freezeItemErr: temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil)}
	registerFreezeArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.Error(t, env.GetWorkflowError(), "a rolled-back settlement fails its run")
	assert.Contains(t, env.GetWorkflowError().Error(), "item not freezable", "the run's failure says why")

	require.Len(t, noBids.raised, 1, "the rollback is recorded as one settlement exception")
	assert.Equal(t, listingID, noBids.raised[0].ListingID)
	assert.Equal(t, itemsactivity.FreezeItemActivityName, noBids.raised[0].Step)
	assert.Empty(t, noBids.resolved, "a rollback's exception stays open as its record")

	assert.Equal(t, []string{
		itemsactivity.FreezeItemActivityName,
		marketplaceactivity.MarkSettlementFailedActivityName,
		marketplaceactivity.LoseAllBidsActivityName,
		walletactivity.ReleaseAllHoldsActivityName,
		itemsactivity.UnfreezeItemActivityName,
	}, arm.calls)
	assert.Equal(t, listingID, arm.markFailedIn.ListingID)
	assert.Equal(t, listingID, arm.loseAllIn.ListingID, "every bid on the listing ends LOST")
	assert.Equal(t, bstemporal.QueueMarketplace.String(), arm.queues[marketplaceactivity.LoseAllBidsActivityName])
	assert.Equal(t, walletactivity.ReleaseAllHoldsInput{ListingID: listingID, BidIDs: frozen.BidIDs}, arm.releaseAllIn,
		"every hold 0a found on the listing goes back, the winner's included")
	assert.Equal(t, bstemporal.QueueWallet.String(), arm.queues[walletactivity.ReleaseAllHoldsActivityName])
	assert.Equal(t, itemsactivity.UnfreezeItemInput{ItemID: itemID, SellerID: sellerID, ListingID: listingID}, arm.unfreezeIn)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), arm.queues[marketplaceactivity.MarkSettlementFailedActivityName])
	assert.Equal(t, bstemporal.QueueItems.String(), arm.queues[itemsactivity.UnfreezeItemActivityName])
}

// A 0a that can never succeed has frozen nothing and learned no item, so the
// rollback records the exception and asks for SETTLEMENT_FAILED — which leaves a
// listing another flow already ended as it is — and touches neither its bids nor
// its item: they belong to whichever flow ended it.
func TestWorkflow_FreezeListingImpossible_RollsBackTheListingOnly(t *testing.T) {
	listingID := uuid.New()
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{}, temporal.NewNonRetryableApplicationError("listing withdrawn", "FreezeListingImpossible", nil)
	})
	arm := &freezeArm{}
	registerFreezeArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.Error(t, env.GetWorkflowError())

	require.Len(t, noBids.raised, 1)
	assert.Equal(t, marketplaceactivity.FreezeListingActivityName, noBids.raised[0].Step)
	assert.Equal(t, []string{marketplaceactivity.MarkSettlementFailedActivityName}, arm.calls)
	assert.Equal(t, listingID, arm.markFailedIn.ListingID)
}

// An outage is not an impossibility: 0b outlasting its cap escalates and parks
// like every other step (§Req 10), and once items is back the settlement carries
// on instead of rolling back a valid sale (ADR-0018).
func TestWorkflow_FreezeItemOutage_ParksInsteadOfRollingBack(t *testing.T) {
	listingID := uuid.New()
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{freezeItemErr: errors.New("dial tcp: connection refused")}
	registerFreezeArm(env, arm)
	registerPivotArm(env, arm)
	registerTailArm(env, arm)
	// items recovers while parked
	env.RegisterDelayedCallback(func() { arm.freezeItemErr = nil }, stepCap+reparkInterval/2)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	require.Len(t, noBids.raised, 1, "the outage escalated once")
	assert.Equal(t, itemsactivity.FreezeItemActivityName, noBids.raised[0].Step)
	assert.Len(t, noBids.resolved, 1, "and was resolved once 0b got through")
	assert.Contains(t, arm.calls, walletactivity.CommitHoldActivityName, "the settlement went on through the pivot")
	assert.NotContains(t, arm.calls, marketplaceactivity.MarkSettlementFailedActivityName, "an outage never rolls back")
}

// A rollback action is retried without a cap (§Req 12, 36): one failing
// transiently is tried again until it lands, and the rollback carries on rather
// than stopping halfway.
func TestWorkflow_RollbackActionFailsTransiently_RetriesUntilItLands(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	blip := errors.New("dial tcp: connection refused")
	arm := &freezeArm{
		freezeItemErr:  temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil),
		markFailedErrs: []error{blip, blip, blip},
	}
	registerFreezeArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	assert.Equal(t, []string{
		itemsactivity.FreezeItemActivityName,
		marketplaceactivity.MarkSettlementFailedActivityName, // blip
		marketplaceactivity.MarkSettlementFailedActivityName, // blip
		marketplaceactivity.MarkSettlementFailedActivityName, // blip
		marketplaceactivity.MarkSettlementFailedActivityName, // lands
		marketplaceactivity.LoseAllBidsActivityName,
		walletactivity.ReleaseAllHoldsActivityName,
		itemsactivity.UnfreezeItemActivityName,
	}, arm.calls)
}

// 0b parks on an outage, then turns out impossible on a later lap. The park's
// exception is resolved — the step is no longer waiting on anything — so the
// rollback opens its own, with the impossibility as its reason, and alerts. Left
// open, the park's row would swallow the rollback's raise on the (workflow, step)
// key and the record would still blame the outage.
func TestWorkflow_FreezeItemParksThenImpossible_RollbackRaisesItsOwnException(t *testing.T) {
	listingID := uuid.New()
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{freezeItemErr: errors.New("dial tcp: connection refused")}
	registerFreezeArm(env, arm)
	// while parked, the item turns out to have left its seller
	env.RegisterDelayedCallback(func() {
		arm.freezeItemErr = temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil)
	}, stepCap+reparkInterval/2)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.Error(t, env.GetWorkflowError())

	require.Len(t, noBids.raised, 2, "the park and the rollback each raise")
	assert.Contains(t, noBids.raised[0].Reason, "connection refused")
	assert.Contains(t, noBids.raised[1].Reason, "item not freezable", "the rollback's record names the impossibility")
	assert.Len(t, noBids.resolved, 1, "the park's exception is resolved before the rollback raises")
	assert.Contains(t, arm.calls, marketplaceactivity.MarkSettlementFailedActivityName)
}

// An outage is not an impossibility for 0a either (§Req 10): marketplace's own DB
// outlasting the cap escalates and parks, and the settlement carries on once it
// is back, with no rollback.
func TestWorkflow_FreezeListingOutage_ParksInsteadOfRollingBack(t *testing.T) {
	listingID := uuid.New()
	var down = true
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		if down {
			return marketplaceactivity.FreezeListingOutput{}, errors.New("dial tcp: connection refused")
		}
		return marketplaceactivity.FreezeListingOutput{Outcome: marketplaceactivity.OutcomeNoBids, ListingID: listingID}, nil
	})
	arm := &freezeArm{}
	registerFreezeArm(env, arm)
	env.RegisterDelayedCallback(func() { down = false }, stepCap+reparkInterval/2)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError(), "the settlement completed once marketplace was back")
	require.Len(t, noBids.raised, 1, "the outage escalated once")
	assert.Equal(t, marketplaceactivity.FreezeListingActivityName, noBids.raised[0].Step)
	assert.Len(t, noBids.resolved, 1)
	assert.Empty(t, arm.calls, "an outage never rolls back")
	assert.Equal(t, []string{itemsactivity.ReturnItemActivityName, marketplaceactivity.ExpireListingActivityName}, noBids.calls)
}

// Cancelling a settlement that is only parked is not an impossibility: nothing
// is undone, and the run ends cancelled.
func TestWorkflow_CancelledWhileParked_DoesNotRollBack(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{freezeItemErr: errors.New("dial tcp: connection refused")}
	registerFreezeArm(env, arm)
	env.RegisterDelayedCallback(env.CancelWorkflow, stepCap+reparkInterval/2)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	var canceled *temporal.CanceledError
	assert.ErrorAs(t, env.GetWorkflowError(), &canceled)
	assert.NotContains(t, arm.calls, marketplaceactivity.MarkSettlementFailedActivityName)
}

// A rollback that has started finishes even if the workflow is cancelled midway
// (§Req 12): it runs on a context the cancellation cannot reach, so the listing,
// the bids and the item are never left half undone.
func TestWorkflow_CancelledDuringRollback_RollbackStillFinishes(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	blip := errors.New("dial tcp: connection refused")
	arm := &freezeArm{
		freezeItemErr: temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil),
		// keeps MarkSettlementFailed retrying long enough to cancel in the middle
		markFailedErrs: []error{blip, blip, blip, blip, blip},
	}
	registerFreezeArm(env, arm)
	env.RegisterDelayedCallback(env.CancelWorkflow, 5*time.Second)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	assert.Contains(t, arm.calls, marketplaceactivity.LoseAllBidsActivityName, "the rollback went on past the cancellation")
	assert.Contains(t, arm.calls, itemsactivity.UnfreezeItemActivityName)
}

// 1a and 1b are the last steps before the pivot (§Req 12, 37): one that can never
// succeed rolls everything back the same way 0b does — the exception, the listing
// SETTLEMENT_FAILED, every bid LOST (the one 1a moved to WON included), every hold
// released and the item back with its seller — and never reaches a later step.
func TestWorkflow_PivotArmImpossible_RollsBackEverything(t *testing.T) {
	impossible := func(msg string) error { return temporal.NewNonRetryableApplicationError(msg, "Impossible", nil) }

	tests := []struct {
		name          string
		setWinningErr error
		commitHoldErr error
		step          string
		ran           []string
	}{
		{
			name:          "1a SetWinningBid: the bid was demoted or is gone",
			setWinningErr: impossible("bid not winning"),
			step:          marketplaceactivity.SetWinningBidActivityName,
			ran:           []string{itemsactivity.FreezeItemActivityName, marketplaceactivity.SetWinningBidActivityName},
		},
		{
			// the pivot boundary is a successful CommitHold, so a failed one moved no
			// gold and rolling back is still legal (ADR-0010)
			name:          "1b CommitHold: the hold was released or expired",
			commitHoldErr: impossible("hold released"),
			step:          walletactivity.CommitHoldActivityName,
			ran: []string{itemsactivity.FreezeItemActivityName, marketplaceactivity.SetWinningBidActivityName,
				walletactivity.CommitHoldActivityName},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			listingID, itemID, sellerID := uuid.New(), uuid.New(), uuid.New()
			frozen := hasWinner(listingID, itemID, sellerID)
			env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
				return frozen, nil
			})
			arm := &freezeArm{setWinningErr: tt.setWinningErr, commitHoldErr: tt.commitHoldErr}
			registerFreezeArm(env, arm)
			registerPivotArm(env, arm)

			env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

			require.True(t, env.IsWorkflowCompleted())
			require.Error(t, env.GetWorkflowError(), "a rolled-back settlement fails its run")

			require.Len(t, noBids.raised, 1)
			assert.Equal(t, tt.step, noBids.raised[0].Step)
			assert.Equal(t, append(tt.ran,
				marketplaceactivity.MarkSettlementFailedActivityName,
				marketplaceactivity.LoseAllBidsActivityName,
				walletactivity.ReleaseAllHoldsActivityName,
				itemsactivity.UnfreezeItemActivityName,
			), arm.calls)
			assert.Equal(t, frozen.BidIDs, arm.releaseAllIn.BidIDs)
			assert.Equal(t, itemsactivity.UnfreezeItemInput{ItemID: itemID, SellerID: sellerID, ListingID: listingID}, arm.unfreezeIn)
		})
	}
}

// Wallet down mid-rollback: ReleaseAllHolds is retried without a cap until it
// lands, and only then does the item go back — the rollback never stops between
// the gold and the item (§Req 12, 36).
func TestWorkflow_ReleaseAllHoldsFailsTransiently_RetriesThenUnfreezes(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	blip := errors.New("dial tcp: connection refused")
	arm := &freezeArm{
		freezeItemErr:  temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil),
		releaseAllErrs: []error{blip, blip},
	}
	registerFreezeArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	assert.Equal(t, []string{
		itemsactivity.FreezeItemActivityName,
		marketplaceactivity.MarkSettlementFailedActivityName,
		marketplaceactivity.LoseAllBidsActivityName,
		walletactivity.ReleaseAllHoldsActivityName, // blip
		walletactivity.ReleaseAllHoldsActivityName, // blip
		walletactivity.ReleaseAllHoldsActivityName, // lands
		itemsactivity.UnfreezeItemActivityName,
	}, arm.calls)
}

// A 0a result recorded before BidIDs existed decodes it as nil. The rollback
// still runs to the end — ReleaseAllHolds is handed no bids and wallet releases
// none — rather than failing on the missing field.
func TestWorkflow_FrozenWithoutBidIDs_RollsBackReleasingNothing(t *testing.T) {
	listingID, itemID, sellerID := uuid.New(), uuid.New(), uuid.New()
	frozen := hasWinner(listingID, itemID, sellerID)
	frozen.BidIDs = nil
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return frozen, nil
	})
	arm := &freezeArm{freezeItemErr: temporal.NewNonRetryableApplicationError("item not freezable", "FreezeItemImpossible", nil)}
	registerFreezeArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	assert.Empty(t, arm.releaseAllIn.BidIDs)
	assert.Contains(t, arm.calls, itemsactivity.UnfreezeItemActivityName, "the rollback still finishes")
}

// Past the pivot the tail runs 2 → 3 → 4 → 5 → 6, each on its owner's queue, and
// the settlement completes (FS-NXP1W §Req 6, 29–33).
func TestWorkflow_HasWinner_RunsTheTailInOrderAndCompletes(t *testing.T) {
	listingID, itemID, sellerID := uuid.New(), uuid.New(), uuid.New()
	frozen := hasWinner(listingID, itemID, sellerID)
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return frozen, nil
	})
	arm := &freezeArm{}
	registerFreezeArm(env, arm)
	registerPivotArm(env, arm)
	registerTailArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Empty(t, noBids.raised, "nothing escalated")
	assert.Equal(t, []string{
		itemsactivity.FreezeItemActivityName,
		marketplaceactivity.SetWinningBidActivityName,
		walletactivity.CommitHoldActivityName,
		walletactivity.ReleaseLosingHoldsActivityName,
		walletactivity.CreditSellerActivityName,
		itemsactivity.TransferItemActivityName,
		ledgeractivity.AppendLedgerActivityName,
		marketplaceactivity.MarkSoldActivityName,
	}, arm.calls)

	// 2: every bid 0a found; wallet filters the winner out itself
	assert.Equal(t, walletactivity.ReleaseLosingHoldsInput{
		ListingID:    listingID,
		WinnerBidID:  frozen.WinnerBidID,
		LosingBidIDs: frozen.BidIDs,
	}, arm.releaseLosingIn)
	assert.Equal(t, bstemporal.QueueWallet.String(), arm.queues[walletactivity.ReleaseLosingHoldsActivityName])

	// 3: the key is workflow ID + activity name (§Req 18, ADR-0009)
	require.Len(t, arm.creditIns, 1)
	assert.Equal(t, walletactivity.CreditSellerInput{
		SellerID:       sellerID,
		Amount:         frozen.Amount,
		IdempotencyKey: arm.creditRunID + ":" + walletactivity.CreditSellerActivityName,
	}, arm.creditIns[0])
	assert.Equal(t, bstemporal.QueueWallet.String(), arm.queues[walletactivity.CreditSellerActivityName])

	// 4: the item goes to the winner
	assert.Equal(t, itemsactivity.TransferItemInput{
		ItemID:        itemID,
		BuyerMemberID: frozen.WinnerMemberID,
		ListingID:     listingID,
	}, arm.transferIn)
	assert.Equal(t, bstemporal.QueueItems.String(), arm.queues[itemsactivity.TransferItemActivityName])

	// 5: two balanced legs keyed by the account IDs wallet handed back (§Req 18,
	// 32), under the derived transaction ID, on ledger's own queue
	require.Len(t, arm.ledgerIns, 1)
	assert.Equal(t, ledgeractivity.AppendLedgerTxInput{
		TransactionID: SettlementTransactionID(listingID),
		Reason:        ledgeractivity.ReasonSettlement,
		Currency:      "GOLD",
		ReferenceID:   listingID,
		Legs: []ledgeractivity.Leg{
			{AccountID: arm.buyerAccountID, Amount: frozen.Amount, Direction: "DEBIT"},
			{AccountID: arm.sellerAccountID, Amount: frozen.Amount, Direction: "CREDIT"},
		},
	}, arm.ledgerIns[0])
	assert.Equal(t, bstemporal.QueueLedger.String(), arm.queues[ledgeractivity.AppendLedgerActivityName])

	// 6
	assert.Equal(t, marketplaceactivity.MarkSoldInput{ListingID: listingID}, arm.markSoldIn)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), arm.queues[marketplaceactivity.MarkSoldActivityName])
}

// Past the pivot there is no way back (§Req 13, 14): a tail step that is
// impossible is an invariant breach that escalates and parks like an outage, and
// the settlement completes once it gets through. Nothing rolls back, and only the
// parked step runs again.
func TestWorkflow_TailImpossible_ParksAndNeverRollsBack(t *testing.T) {
	impossible := temporal.NewNonRetryableApplicationError("invariant breach", "Impossible", nil)

	for _, step := range []string{
		walletactivity.ReleaseLosingHoldsActivityName,
		walletactivity.CreditSellerActivityName,
		itemsactivity.TransferItemActivityName,
		ledgeractivity.AppendLedgerActivityName,
		marketplaceactivity.MarkSoldActivityName,
	} {
		t.Run(step, func(t *testing.T) {
			listingID := uuid.New()
			env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
				return hasWinner(listingID, uuid.New(), uuid.New()), nil
			})
			arm := &freezeArm{tailErrs: map[string][]error{step: {impossible}}}
			registerFreezeArm(env, arm)
			registerPivotArm(env, arm)
			registerTailArm(env, arm)

			env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

			require.True(t, env.IsWorkflowCompleted())
			require.NoError(t, env.GetWorkflowError(), "a settlement never fails past the pivot")
			require.Len(t, noBids.raised, 1)
			assert.Equal(t, step, noBids.raised[0].Step)
			assert.Len(t, noBids.resolved, 1, "the exception is resolved once the step gets through")
			assert.NotContains(t, arm.calls, marketplaceactivity.MarkSettlementFailedActivityName, "nothing rolls back past the pivot")
			assert.Equal(t, 2, countOf(arm.calls, step), "the parked step runs again")
			assert.Equal(t, 1, countOf(arm.calls, walletactivity.CommitHoldActivityName), "steps before it do not")
			assert.Equal(t, marketplaceactivity.MarkSoldActivityName, arm.calls[len(arm.calls)-1], "and the settlement finishes")
		})
	}
}

// CreditSeller is the one tail step with no prior state to make it idempotent, so
// its key must be the same on every lap: wallet dedups on it, and a key that
// changed after a park would credit the seller twice.
func TestWorkflow_CreditSellerParks_RetriesWithTheSameKey(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{tailErrs: map[string][]error{
		walletactivity.CreditSellerActivityName: {temporal.NewNonRetryableApplicationError("wallet refused", "Impossible", nil)},
	}}
	registerFreezeArm(env, arm)
	registerPivotArm(env, arm)
	registerTailArm(env, arm)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.Len(t, arm.creditIns, 2)
	assert.Equal(t, arm.creditIns[0].IdempotencyKey, arm.creditIns[1].IdempotencyKey)
}

// Ledger down past the cap (FS-NXP1W Edge States "Ledger down"): step 5
// escalates and parks, and once the ledger is back the settlement completes.
// Every attempt, before and after the park, carries the same transaction ID, so
// the ledger posts it once however many times it was sent.
func TestWorkflow_LedgerDownParks_RetriesWithTheSameTransactionID(t *testing.T) {
	listingID := uuid.New()
	env, noBids := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{ledgerErr: errors.New("dial tcp: connection refused")}
	registerFreezeArm(env, arm)
	registerPivotArm(env, arm)
	registerTailArm(env, arm)
	// the ledger recovers while parked
	env.RegisterDelayedCallback(func() { arm.ledgerErr = nil }, stepCap+reparkInterval/2)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	require.Len(t, noBids.raised, 1, "the outage escalated once")
	assert.Equal(t, ledgeractivity.AppendLedgerActivityName, noBids.raised[0].Step)
	assert.Len(t, noBids.resolved, 1, "and was resolved once step 5 got through")
	assert.Equal(t, 1, countOf(arm.calls, itemsactivity.TransferItemActivityName), "steps before it do not run again")
	assert.Equal(t, marketplaceactivity.MarkSoldActivityName, arm.calls[len(arm.calls)-1], "and the settlement finishes")

	require.Greater(t, len(arm.ledgerIns), 1, "step 5 ran again after the park")
	for _, in := range arm.ledgerIns {
		assert.Equal(t, arm.ledgerIns[0], in, "every attempt sends the same transaction")
	}
	assert.Equal(t, SettlementTransactionID(listingID), arm.ledgerIns[0].TransactionID)
}

// A run that was already past step 4 when step 5 shipped has no AppendLedgerTx in
// its history, so on replay it must go straight to MarkSold rather than fail with
// a nondeterminism error (FS-NXP1W Edge States "Workflow code deployed").
func TestWorkflow_RunFromBeforeStepFive_SkipsTheLedgerAppend(t *testing.T) {
	listingID := uuid.New()
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return hasWinner(listingID, uuid.New(), uuid.New()), nil
	})
	arm := &freezeArm{}
	registerFreezeArm(env, arm)
	registerPivotArm(env, arm)
	registerTailArm(env, arm)
	env.OnGetVersion(appendLedgerTxChange, workflow.DefaultVersion, 1).Return(workflow.DefaultVersion)

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerAcceptBid})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.NotContains(t, arm.calls, ledgeractivity.AppendLedgerActivityName)
	assert.Equal(t, marketplaceactivity.MarkSoldActivityName, arm.calls[len(arm.calls)-1])
}

func countOf(calls []string, name string) int {
	n := 0
	for _, c := range calls {
		if c == name {
			n++
		}
	}
	return n
}

// The settlement transaction ID is a permanent contract (FS-NXP1W §Req 32): the
// ledger dedups on it, so a changed namespace or derivation posts every open
// settlement a second time. The expected value is uuidv5 computed outside Go.
func TestSettlementTransactionID_IsPinned(t *testing.T) {
	assert.Equal(t, uuid.MustParse("84942edd-022c-469d-b7f3-aa5e6c34e613"), settlementNamespace, "the namespace never changes")

	listingID := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	assert.Equal(t, uuid.MustParse("55aaea4a-0686-5271-9a3e-3fd1a71d6a05"), SettlementTransactionID(listingID),
		`uuidv5(namespace, "settlement:" + listingId)`)
}
