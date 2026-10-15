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

type stubFreezer struct{ err error }

func (s *stubFreezer) FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) error {
	return s.err
}

// Registered through the activity's own Register, via envWorker.
func newFreezeItemEnv(svc ItemsFreezer) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewItemsActivity(svc).Register(envWorker{env: env})
	return env
}

// 0b rolls the settlement back on a semantic impossibility (FS-NXP1W §Req 12):
// an item whose owner is not the seller, or whose status is neither LISTED nor
// PENDING_SETTLEMENT, comes out of the service as ErrItemNotFreezable and must
// leave the activity non-retryable. Anything else is an outage, which parks.
func TestFreezeItemActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"item not freezable for this seller", ErrItemNotFreezable, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &stubFreezer{err: fmt.Errorf("freeze item: %w", tt.err)}

			_, err := newFreezeItemEnv(svc).ExecuteActivity(commonactivity.FreezeItemActivityName,
				commonactivity.FreezeItemInput{ItemID: uuid.New(), SellerID: uuid.New()})
			if err == nil {
				t.Fatal("err = nil, want the service failure")
			}

			var appErr *temporal.ApplicationError
			if !errors.As(err, &appErr) {
				t.Fatalf("err = %T, want an application error", err)
			}
			if appErr.NonRetryable() != tt.wantImpossible {
				t.Errorf("non-retryable = %v, want %v", appErr.NonRetryable(), tt.wantImpossible)
			}
			if tt.wantImpossible && appErr.Type() != freezeItemImpossible {
				t.Errorf("type = %q, want %q", appErr.Type(), freezeItemImpossible)
			}
		})
	}
}
