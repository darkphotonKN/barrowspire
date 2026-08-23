package listing

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidAmount        = errors.New("invalid amount")
	ErrInvalidBidTransition = errors.New("invalid bid transition")
)

// --- State and Constants ---
type BidType string

const (
	BidTypeBid    BidType = "BID"
	BidTypeBuyout BidType = "BUYOUT"
)

type BidStatus string

const (
	// BidStatusPending is where every bid starts: placed, but with no gold held
	// behind it yet. It leads nothing and wins nothing until wallet confirms.
	BidStatusPending   BidStatus = "PENDING"
	BidStatusWinning   BidStatus = "WINNING"
	BidStatusOutbid    BidStatus = "OUTBID"
	BidStatusWon       BidStatus = "WON"
	BidStatusCancelled BidStatus = "CANCELLED"
	// BidStatusFailed is terminal: wallet could not hold the gold, so this bid
	// never took the lead.
	BidStatusFailed BidStatus = "FAILED"
)

type Bid struct {
	id        uuid.UUID
	listingID uuid.UUID
	memberID  uuid.UUID
	bidType   BidType
	amount    int
	status    BidStatus
	// idempotencyKey is uuid.Nil when the caller supplied none. Bids without a
	// key are never deduplicated against one another.
	idempotencyKey uuid.UUID
	createdAt      time.Time
	updatedAt      time.Time
}

func newBid(listingID uuid.UUID, memberID uuid.UUID, bidType BidType, amount int, idempotencyKey uuid.UUID, now time.Time) (*Bid, error) {
	// invariants
	if amount <= 0 {
		return nil, ErrInvalidAmount
	}

	if listingID == uuid.Nil || memberID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Bid{
		id:        uuid.New(),
		listingID: listingID,
		memberID:  memberID,
		bidType:   bidType,
		amount:    amount,
		// born PENDING, not WINNING: the gold behind this bid has not been held
		// yet, so it cannot lead until ConfirmBid says wallet succeeded
		status:         BidStatusPending,
		idempotencyKey: idempotencyKey,
		createdAt:      now,
		updatedAt:      now,
	}, nil
}

type BidReconstituteParams struct {
	ID             uuid.UUID
	ListingID      uuid.UUID
	MemberID       uuid.UUID
	Type           BidType
	Amount         int
	Status         BidStatus
	IdempotencyKey uuid.UUID
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type BidSnapshot struct {
	ID             uuid.UUID
	ListingID      uuid.UUID
	MemberID       uuid.UUID
	Type           BidType
	Amount         int
	Status         BidStatus
	IdempotencyKey uuid.UUID
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
