package listing

import "time"

var validBidTransitions = map[BidStatus]map[BidStatus]struct{}{
	BidStatusPending: {
		BidStatusWinning:   {}, // wallet held the gold, this bid takes the lead
		BidStatusFailed:    {}, // wallet could not hold the gold
		BidStatusCancelled: {}, // the bidder withdrew before the hold landed
	},
	BidStatusWinning: {
		BidStatusOutbid:    {}, // a higher bid took the lead
		BidStatusWon:       {}, // settled as the winner
		BidStatusCancelled: {}, // the bidder withdrew
	},
}

func canBidTransition(from, to BidStatus) bool {
	validMap, ok := validBidTransitions[from]
	if !ok {
		return false
	}
	_, ok = validMap[to]
	return ok
}

func (b *Bid) transitionTo(to BidStatus, now time.Time) error {
	if !canBidTransition(b.status, to) {
		return ErrInvalidBidTransition
	}

	b.status = to
	b.updatedAt = now
	return nil
}
