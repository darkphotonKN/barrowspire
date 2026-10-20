package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
)

// ExpiredListingFinder is what the poller needs from the read side: ACTIVE
// listings ending at or before now, ordered by (ends_at, id), strictly after the
// cursor (nil for the first page).
type ExpiredListingFinder interface {
	ExpiredActiveListings(ctx context.Context, now time.Time, after *dto.ExpiredListing, limit int) ([]dto.ExpiredListing, error)
}

// StartExpiredSettlementsUC is the expiry poller's work (FS-NXP1W §Req 2, ADR-0016).
type StartExpiredSettlementsUC struct {
	finder  ExpiredListingFinder
	starter SettlementStarter
}

func NewStartExpiredSettlementsUC(finder ExpiredListingFinder, starter SettlementStarter) *StartExpiredSettlementsUC {
	return &StartExpiredSettlementsUC{finder: finder, starter: starter}
}

// Handle starts a settlement for every ACTIVE listing that has ended by now. It
// walks every page rather than the first: a listing whose settlement parked before
// 0a froze it stays ACTIVE and is selected again each tick, and a first-page-only
// poller would let such listings crowd out every later one. Starting one again is
// harmless, since a start that finds the workflow already running is success.
//
// One listing's failed start does not stop the others. Every failure is returned,
// joined, for the poller to log once; the next tick retries it, since it is still
// ACTIVE and expired.
func (uc *StartExpiredSettlementsUC) Handle(ctx context.Context, now time.Time) error {
	var failed []error
	var after *dto.ExpiredListing
	for {
		page, err := uc.finder.ExpiredActiveListings(ctx, now, after, expiryPollPage)
		if err != nil {
			return errors.Join(append(failed, fmt.Errorf("read expired listings: %w", err))...)
		}
		for _, l := range page {
			if err := uc.start(ctx, l.ID); err != nil {
				failed = append(failed, fmt.Errorf("start settlement for listing %v: %w", l.ID, err))
			}
		}
		if len(page) < expiryPollPage {
			return errors.Join(failed...)
		}
		after = &page[len(page)-1]
	}
}

// start runs one settlement start under its own deadline.
func (uc *StartExpiredSettlementsUC) start(ctx context.Context, listingID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(ctx, expiryStartTimeout)
	defer cancel()
	return uc.starter.StartSettlement(ctx, listingID, TriggerExpiry)
}

// expiryPollPage bounds one read of expired listings.
const expiryPollPage = 100

// expiryStartTimeout bounds one settlement start, so a slow or unreachable Temporal
// costs each listing at most this long instead of stalling the whole tick. A start
// is one RPC; a healthy one is milliseconds.
const expiryStartTimeout = 5 * time.Second
