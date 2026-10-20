package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// ExpiredListing is one ACTIVE listing past its end, as the poller pages them.
type ExpiredListing struct {
	ID     uuid.UUID
	EndsAt time.Time
}

// ExpiredListingFinder is what the poller needs from the read side: ACTIVE
// listings ending at or before now, ordered by (ends_at, id), strictly after the
// cursor (nil for the first page).
type ExpiredListingFinder interface {
	ExpiredActiveListings(ctx context.Context, now time.Time, after *ExpiredListing, limit int) ([]ExpiredListing, error)
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
// One listing's failed start does not stop the others. It is logged and reported,
// and the next tick retries it, since it is still ACTIVE and expired.
func (uc *StartExpiredSettlementsUC) Handle(ctx context.Context, now time.Time) error {
	var failed []error
	var after *ExpiredListing
	for {
		page, err := uc.finder.ExpiredActiveListings(ctx, now, after, expiryPollPage)
		if err != nil {
			return errors.Join(append(failed, fmt.Errorf("read expired listings: %w", err))...)
		}
		for _, l := range page {
			if err := uc.starter.StartSettlement(ctx, l.ID, TriggerExpiry); err != nil {
				slog.ErrorContext(ctx, "starting settlement for an expired listing failed, retried next tick",
					"listing_id", l.ID, "error", err)
				failed = append(failed, fmt.Errorf("start settlement for listing %v: %w", l.ID, err))
			}
		}
		if len(page) < expiryPollPage {
			return errors.Join(failed...)
		}
		after = &page[len(page)-1]
	}
}

// expiryPollPage bounds one read of expired listings.
const expiryPollPage = 100
