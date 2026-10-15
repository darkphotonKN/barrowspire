package items

import (
	"context"
	"errors"
	"testing"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubUnfreezer struct {
	err   error
	calls int

	gotItemID, gotSellerID, gotListingID uuid.UUID
}

func (s *stubUnfreezer) UnfreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) error {
	s.calls++
	s.gotItemID, s.gotSellerID, s.gotListingID = itemID, sellerID, listingID
	return s.err
}

// Register takes a worker.Worker, which the test environment does not satisfy,
// so the activity is registered here under the same contract name.
func newUnfreezeItemEnv(svc ItemsUnfreezer) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivityWithOptions(NewUnfreezeItemActivity(svc).UnfreezeItemActivity, activity.RegisterOptions{
		Name: commonactivity.UnfreezeItemActivityName,
	})
	return env
}

// The activity is registered under the contract's name and hands the input to
// the service field for field.
func TestUnfreezeItemActivity_PassesInputThrough(t *testing.T) {
	svc := &stubUnfreezer{}
	in := commonactivity.UnfreezeItemInput{ItemID: uuid.New(), SellerID: uuid.New(), ListingID: uuid.New()}

	if _, err := newUnfreezeItemEnv(svc).ExecuteActivity(commonactivity.UnfreezeItemActivityName, in); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if svc.calls != 1 {
		t.Fatalf("calls = %d, want 1", svc.calls)
	}
	if svc.gotItemID != in.ItemID || svc.gotSellerID != in.SellerID || svc.gotListingID != in.ListingID {
		t.Errorf("service got (item %v, seller %v, listing %v), want (%v, %v, %v)",
			svc.gotItemID, svc.gotSellerID, svc.gotListingID, in.ItemID, in.SellerID, in.ListingID)
	}
}

// A rollback action has nothing to escalate to, so it never declares a failure
// non-retryable: it is retried without a cap until it succeeds (§Req 12, 36).
func TestUnfreezeItemActivity_Failure_StaysRetryable(t *testing.T) {
	svc := &stubUnfreezer{err: errors.New("dial tcp: connection refused")}

	_, err := newUnfreezeItemEnv(svc).ExecuteActivity(commonactivity.UnfreezeItemActivityName,
		commonactivity.UnfreezeItemInput{ItemID: uuid.New(), SellerID: uuid.New(), ListingID: uuid.New()})
	if err == nil {
		t.Fatal("err = nil, want the service failure")
	}

	var appErr *temporal.ApplicationError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %T, want an application error", err)
	}
	if appErr.NonRetryable() {
		t.Error("a rollback action is retried without a cap; it must never be non-retryable")
	}
}
