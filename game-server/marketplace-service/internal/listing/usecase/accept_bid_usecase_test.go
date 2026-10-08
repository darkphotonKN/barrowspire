package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeStarter stands in for Temporal. It records every start so a test can prove
// a refused AcceptBid never reaches the workflow, and can be scripted to fail.
type fakeStarter struct {
	err        error
	calls      int
	gotListing uuid.UUID
	gotTrigger TriggerKind
}

func (f *fakeStarter) StartSettlement(ctx context.Context, listingID uuid.UUID, trigger TriggerKind) error {
	f.calls++
	f.gotListing = listingID
	f.gotTrigger = trigger
	return f.err
}

// FS-NXP1W §Req 3: the seller accepts the current WINNING bid, and settlement
// starts under the ACCEPT_BID trigger. Only the listing reaches the starter —
// 0a picks the winner, the same way for every trigger.
func TestAcceptBidUsecase_SellerWithWinningBid_StartsSettlementOnce(t *testing.T) {
	l, _ := listingWithLeader(t)
	starter := &fakeStarter{}

	err := NewAcceptBidUsecase(&fakeRepo{listing: l}, starter).Handle(context.Background(), AcceptBidCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  l.Snapshot().SellerID,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	require.Equal(t, 1, starter.calls)
	assert.Equal(t, l.Snapshot().ID, starter.gotListing)
	assert.Equal(t, TriggerAcceptBid, starter.gotTrigger)
}

// Every refusal is the domain's sentinel, intact through the use case so the
// handler can map it, and none of them starts a settlement.
func TestAcceptBidUsecase_Refused_NeverStartsSettlement(t *testing.T) {
	tests := []struct {
		name    string
		setup   func(t *testing.T) (*listing.Listing, func(l *listing.Listing) AcceptBidCommand)
		findErr error
		wantErr error
	}{
		{
			name: "not the seller",
			setup: func(t *testing.T) (*listing.Listing, func(*listing.Listing) AcceptBidCommand) {
				l, _ := listingWithLeader(t)
				return l, func(l *listing.Listing) AcceptBidCommand {
					return AcceptBidCommand{ListingID: l.Snapshot().ID, MemberID: uuid.New(), Now: time.Now()}
				}
			},
			wantErr: listing.ErrNotSeller,
		},
		{
			name: "not ACTIVE",
			setup: func(t *testing.T) (*listing.Listing, func(*listing.Listing) AcceptBidCommand) {
				l, _ := listingWithLeader(t)
				require.NoError(t, l.Freeze(time.Now()))
				return l, sellerAt(time.Now())
			},
			wantErr: listing.ErrListingNotAcceptingBids,
		},
		{
			name: "expired",
			setup: func(t *testing.T) (*listing.Listing, func(*listing.Listing) AcceptBidCommand) {
				l, _ := listingWithLeader(t)
				return l, sellerAt(l.Snapshot().EndsAt)
			},
			wantErr: listing.ErrListingExpired,
		},
		{
			name: "no bids",
			setup: func(t *testing.T) (*listing.Listing, func(*listing.Listing) AcceptBidCommand) {
				return activeListing(t, 100), sellerAt(time.Now())
			},
			wantErr: listing.ErrNoBidToAccept,
		},
		{
			name: "listing not found",
			setup: func(t *testing.T) (*listing.Listing, func(*listing.Listing) AcceptBidCommand) {
				return activeListing(t, 100), sellerAt(time.Now())
			},
			findErr: commonconstants.ErrNotFound,
			wantErr: commonconstants.ErrNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, cmdFor := tt.setup(t)
			starter := &fakeStarter{}

			err := NewAcceptBidUsecase(&fakeRepo{listing: l, findErr: tt.findErr}, starter).
				Handle(context.Background(), cmdFor(l))

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, 0, starter.calls)
		})
	}
}

func TestAcceptBidUsecase_StarterFailure_IsReturned(t *testing.T) {
	l, _ := listingWithLeader(t)
	startErr := errors.New("temporal unavailable")

	err := NewAcceptBidUsecase(&fakeRepo{listing: l}, &fakeStarter{err: startErr}).
		Handle(context.Background(), sellerAt(time.Now())(l))

	assert.ErrorIs(t, err, startErr)
}

// sellerAt builds the command the listing's own seller would send at now.
func sellerAt(now time.Time) func(*listing.Listing) AcceptBidCommand {
	return func(l *listing.Listing) AcceptBidCommand {
		return AcceptBidCommand{ListingID: l.Snapshot().ID, MemberID: l.Snapshot().SellerID, Now: now}
	}
}
