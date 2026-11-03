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

type stubFreezer struct {
	err                            error
	gotItem, gotSeller, gotListing uuid.UUID
}

func (s *stubFreezer) FreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) error {
	s.gotItem, s.gotSeller, s.gotListing = itemID, sellerID, listingID
	return s.err
}

// Registered through the activity's own Register, via envWorker.
func newFreezeItemEnv(svc ItemsFreezer) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewItemsActivity(svc).Register(envWorker{env: env})
	return env
}

// The write is scoped to the settlement's listing (FS-NXP1W §Req 24a), so the
// activity has to hand the listing through, not just the item and seller.
func TestFreezeItemActivity_FreezesForTheSettlementsListing(t *testing.T) {
	svc := &stubFreezer{}
	in := commonactivity.FreezeItemInput{ItemID: uuid.New(), SellerID: uuid.New(), ListingID: uuid.New()}

	if _, err := newFreezeItemEnv(svc).ExecuteActivity(commonactivity.FreezeItemActivityName, in); err != nil {
		t.Fatalf("freeze: %v", err)
	}
	if svc.gotItem != in.ItemID || svc.gotSeller != in.SellerID || svc.gotListing != in.ListingID {
		t.Errorf("service got item %v seller %v listing %v, want %v %v %v",
			svc.gotItem, svc.gotSeller, svc.gotListing, in.ItemID, in.SellerID, in.ListingID)
	}
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
				commonactivity.FreezeItemInput{ItemID: uuid.New(), SellerID: uuid.New(), ListingID: uuid.New()})
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
