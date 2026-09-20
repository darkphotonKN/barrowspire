package listing

import "time"

var allowedTransitions = map[ListingStatus]map[ListingStatus]struct{}{
	StatusListed: {
		StatusCancelled:         struct{}{},
		StatusPendingSettlement: struct{}{},
		StatusExpired:           struct{}{},
	},
	StatusPendingSettlement: {
		StatusSold:      struct{}{},
		StatusCancelled: struct{}{},
	},
}

func canTransition(from, to ListingStatus) bool {
	validMap, ok := allowedTransitions[from]

	if !ok {
		return false
	}

	_, ok = validMap[to]
	return ok
}

// mutate
func (l *Listing) transitionTo(to ListingStatus, now time.Time) error {
	if !canTransition(l.status, to) {
		return ErrInvalidHoldTransition
	}

	// mutate once safe
	l.status = to
	l.updatedAt = now

	return nil
}
