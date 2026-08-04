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
	BidStatusWinning   BidStatus = "WINNING"
	BidStatusOutbid    BidStatus = "OUTBID"
	BidStatusWon       BidStatus = "WON"
	BidStatusCancelled BidStatus = "CANCELLED"
)

type Bid struct {
	id        uuid.UUID
	listingID uuid.UUID
	memberID  uuid.UUID
	bidType   BidType
	amount    int
	status    BidStatus
	createdAt time.Time
	updatedAt time.Time
}

func newBid(listingID uuid.UUID, memberID uuid.UUID, bidType BidType, amount int, now time.Time) (*Bid, error) {
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
		status:    BidStatusWinning,
		createdAt: now,
		updatedAt: now,
	}, nil
}

type BidReconstituteParams struct {
	ID        uuid.UUID
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Type      BidType
	Amount    int
	Status    BidStatus
	CreatedAt time.Time
	UpdatedAt time.Time
}

type BidSnapshot struct {
	ID        uuid.UUID
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Type      BidType
	Amount    int
	Status    BidStatus
	CreatedAt time.Time
	UpdatedAt time.Time
}
