package listing

import "time"

var validBidTransitions = map[BidStatus]map[BidStatus]struct{}{
	BidStatusPending: {
		BidStatusWinning:   {}, // wallet held the gold, this bid takes the lead
		BidStatusOutbid:    {}, // wallet held the gold, but a higher bid took the lead first
		BidStatusFailed:    {}, // wallet could not hold the gold
		BidStatusCancelled: {}, // the bidder withdrew before the hold landed
		BidStatusLost:      {}, // settlement rolled back before this bid was resolved
	},
	BidStatusWinning: {
		BidStatusOutbid:    {}, // a higher bid took the lead
		BidStatusWon:       {}, // settled as the winner
		BidStatusCancelled: {}, // the bidder withdrew
		BidStatusLost:      {}, // settled, or rolled back, without winning
	},
	BidStatusOutbid: {
		BidStatusLost: {}, // settlement closed the listing; an outbid bid is final
	},
	// WON -> LOST is the only edge out of a terminal status in this machine, and it
	// exists for exactly one reason: a pre-pivot rollback undoing step 1a
	// (FS-NXP1W §Req 12). No gold moved yet — the pivot is what spends it — so the
	// win is safe to take back. After the pivot there is no rollback at all
	// (ADR-0017), which is why nothing else needs an exit from WON.
	BidStatusWon: {
		BidStatusLost: {},
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
