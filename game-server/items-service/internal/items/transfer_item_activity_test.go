package items

import (
	"context"
	"errors"
	"fmt"
	"testing"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubTransferrer struct {
	err   error
	calls int

	gotItemID, gotBuyerID, gotListingID uuid.UUID
}

func (s *stubTransferrer) TransferItem(ctx context.Context, itemID, buyerID, listingID uuid.UUID) error {
	s.calls++
	s.gotItemID, s.gotBuyerID, s.gotListingID = itemID, buyerID, listingID
	return s.err
}

// Register takes a worker.Worker, which the test environment does not satisfy,
// so the activity is registered here under the same contract name.
func newTransferItemEnv(svc ItemsTransfer) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivityWithOptions(NewTransferItemsActivity(svc).TransferItemActivity, activity.RegisterOptions{
		Name: commonactivity.TransferItemActivityName,
	})
	return env
}

// The activity is registered under the contract's name and hands the input to
// the service field for field.
func TestTransferItemActivity_PassesInputThrough(t *testing.T) {
	svc := &stubTransferrer{}
	in := commonactivity.TransferItemInput{ItemID: uuid.New(), BuyerMemberID: uuid.New(), ListingID: uuid.New()}

	if _, err := newTransferItemEnv(svc).ExecuteActivity(commonactivity.TransferItemActivityName, in); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if svc.calls != 1 {
		t.Fatalf("calls = %d, want 1", svc.calls)
	}
	if svc.gotItemID != in.ItemID || svc.gotBuyerID != in.BuyerMemberID || svc.gotListingID != in.ListingID {
		t.Errorf("service got (item %v, buyer %v, listing %v), want (%v, %v, %v)",
			svc.gotItemID, svc.gotBuyerID, svc.gotListingID, in.ItemID, in.BuyerMemberID, in.ListingID)
	}
}

// Past the pivot a non-retryable error means escalate and park (§Req 13), never
// roll back. Only "not frozen for this listing" is impossible; anything else
// stays retryable so the tail policy, not an invariant breach, governs it.
func TestTransferItemActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"item not frozen for this listing", ErrItemNotTransfer, true},
		{"database is down", errors.New("dial tcp: connection refused"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// wrapped the way the service wraps it
			svc := &stubTransferrer{err: fmt.Errorf("transfer item: %w", tt.err)}

			_, err := newTransferItemEnv(svc).ExecuteActivity(commonactivity.TransferItemActivityName,
				commonactivity.TransferItemInput{ItemID: uuid.New(), BuyerMemberID: uuid.New(), ListingID: uuid.New()})
			if err == nil {
				t.Fatal("want an error")
			}

			var appErr *temporal.ApplicationError
			if !errors.As(err, &appErr) {
				t.Fatalf("err = %v, want an ApplicationError", err)
			}
			if appErr.NonRetryable() != tt.wantImpossible {
				t.Errorf("NonRetryable = %v, want %v", appErr.NonRetryable(), tt.wantImpossible)
			}
			if tt.wantImpossible && appErr.Type() != transferItemImpossible {
				t.Errorf("Type = %q, want %q", appErr.Type(), transferItemImpossible)
			}
		})
	}
}
