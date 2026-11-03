package items

import (
	"context"
	"errors"
	"fmt"
	"testing"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubReturner struct {
	err   error
	calls int

	gotItemID, gotListingID uuid.UUID
}

func (s *stubReturner) ReturnItem(ctx context.Context, id, listingID uuid.UUID) error {
	s.calls++
	s.gotItemID, s.gotListingID = id, listingID
	return s.err
}

func newReturnItemEnv(svc ReturnItemWriter) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewReturnItemsActivity(svc).Register(envWorker{env: env})
	return env
}

// NB1 is registered under the contract's name and hands both IDs to the service:
// the listing ID is what keeps a retry from un-listing a relisted item (FS-NXP1W
// Req 24a, 34a).
func TestReturnItemActivity_PassesInputThrough(t *testing.T) {
	svc := &stubReturner{}
	in := commonactivity.ReturnItemInput{ItemID: uuid.New(), ListingID: uuid.New()}

	if _, err := newReturnItemEnv(svc).ExecuteActivity(commonactivity.ReturnItemActivityName, in); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if svc.calls != 1 {
		t.Fatalf("calls = %d, want 1", svc.calls)
	}
	if svc.gotItemID != in.ItemID || svc.gotListingID != in.ListingID {
		t.Errorf("service got (item %v, listing %v), want (%v, %v)",
			svc.gotItemID, svc.gotListingID, in.ItemID, in.ListingID)
	}
}

// A missing item, or one still tagged for this listing in a status NB1 cannot
// return from, no retry can fix: non-retryable, so the workflow escalates at once.
// Anything else (an outage) stays retryable under the step's cap.
func TestReturnItemActivity_ClassifiesFailures(t *testing.T) {
	tests := []struct {
		name             string
		err              error
		wantNonRetryable bool
	}{
		{"item missing", fmt.Errorf("return item: %w", ErrNoItemFound), true},
		{"item corrupted", fmt.Errorf("return item: %w", ErrItemCorrupted), true},
		{"outage", errors.New("dial tcp: connection refused"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newReturnItemEnv(&stubReturner{err: tt.err}).ExecuteActivity(commonactivity.ReturnItemActivityName,
				commonactivity.ReturnItemInput{ItemID: uuid.New(), ListingID: uuid.New()})
			if err == nil {
				t.Fatal("err = nil, want the service failure")
			}

			var appErr *temporal.ApplicationError
			if !errors.As(err, &appErr) {
				t.Fatalf("err = %T, want an application error", err)
			}
			if appErr.NonRetryable() != tt.wantNonRetryable {
				t.Errorf("non-retryable = %v, want %v", appErr.NonRetryable(), tt.wantNonRetryable)
			}
			if tt.wantNonRetryable && appErr.Type() != returnItemImpossible {
				t.Errorf("type = %q, want %q", appErr.Type(), returnItemImpossible)
			}
		})
	}
}
