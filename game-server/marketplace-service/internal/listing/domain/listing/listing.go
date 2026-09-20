package listing

import (
	"time"

	"github.com/google/uuid"
)

type ListingStatus string

const (
	StatusDraft             ListingStatus = "DRAFT"
	StatusListed            ListingStatus = "LISTED"
	StatusCancelled         ListingStatus = "WITHDRAW"
	StatusPendingSettlement ListingStatus = "PENDING_SETTLEMENT"
	StatusExpired           ListingStatus = "STATUS_EXPIRED"
	StatusSold              ListingStatus = "SOLD"
)

type Listing struct {
	id         uuid.UUID
	sellerID   uuid.UUID
	buyerID    *uuid.UUID
	itemID     uuid.UUID
	startPrice int
	soldPrice  *int
	status     ListingStatus
	endsAt     time.Time
	createdAt  time.Time
	updatedAt  time.Time

	// version
	// used for optimistic locking, important in all roots of DDD hexagonal
	// architecture for preventing check, modify, then act races.
	// retries will be costly due to a host of wasted work if there is high
	// contention on a single resource as every time a race is caught with this
	// version a retry is needed, and causes a retry storm. Prevent with
	// standard race prevention mechanisms like row lock or isolation: serializable
	// based on the situation
	version int
}

// snapshot exposes fields for external use, with no path to write fields
type ListingSnapshot struct {
	ID         uuid.UUID
	SellerID   uuid.UUID
	BuyerID    *uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	SoldPrice  *int
	Status     ListingStatus
	EndsAt     time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Version    int
}

func NewListing(sellerID, itemID uuid.UUID, startPrice int, now, endsAt time.Time) (*Listing, error) {
	if sellerID == uuid.Nil {
		return nil, ErrInvalidUUID
	}
	if itemID == uuid.Nil {
		return nil, ErrInvalidUUID
	}
	if !endsAt.After(now) {
		return nil, ErrInvalidEndTime
	}
	if startPrice <= 0 {
		return nil, ErrInvalidStartPrice
	}

	return &Listing{
		id:         uuid.New(),
		sellerID:   sellerID,
		buyerID:    nil,
		itemID:     itemID,
		startPrice: startPrice,
		soldPrice:  nil,
		status:     StatusDraft,
		endsAt:     endsAt,
		createdAt:  now,
		updatedAt:  now,
		version:    0, // births with 0, all aggregate roots start with 0
	}, nil
}

func (l *Listing) Snapshot() ListingSnapshot {
	return ListingSnapshot{
		ID:         l.id,
		SellerID:   l.sellerID,
		BuyerID:    l.buyerID,
		ItemID:     l.itemID,
		StartPrice: l.startPrice,
		SoldPrice:  l.soldPrice,
		Status:     l.status,
		EndsAt:     l.endsAt,
		Version:    l.version,
		CreatedAt:  l.createdAt,
		UpdatedAt:  l.updatedAt,
	}
}

func (l *Listing) Publish(now time.Time) error {
	if l.status != StatusDraft {
		return ErrInvalidListingState
	}
	l.status = StatusListed
	l.updatedAt = now

	return nil
}

func (l *Listing) Cancel(now time.Time) error {
	if l.status != StatusListed {
		return ErrInvalidListingState
	}
	l.status = StatusCancelled
	l.updatedAt = now

	return nil
}

func (l *Listing) MarkSold(now time.Time, buyerID uuid.UUID, soldPrice int) error {
	if l.status != StatusListed {
		return ErrInvalidListingState
	}
	if buyerID == uuid.Nil {
		return ErrInvalidUUID
	}
	if soldPrice <= 0 || soldPrice < l.startPrice {
		return ErrInvalidSoldPrice
	}
	if l.endsAt.After(now) {
		return ErrInvalidSoldTime
	}
	l.buyerID = &buyerID
	l.soldPrice = &soldPrice
	l.status = StatusSold
	l.updatedAt = now
	return nil
}

func (l *Listing) Freeze() error {
	// evolve with fsm
	err := l.transitionTo(StatusPendingSettlement, time.Now())

	if err != nil {
		// propagate sentinel down
		return err
	}

	return nil
}

func (l *Listing) FindWinningBid() {

}

type ReconstituteParams struct {
	ID         uuid.UUID
	SellerID   uuid.UUID
	BuyerID    *uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	SoldPrice  *int
	Status     ListingStatus
	EndsAt     time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Version    int
}

func Reconstitute(params ReconstituteParams) (*Listing, error) {
	// reconstitute core account from params and validated holds
	listing := Listing{
		id:         params.ID,
		sellerID:   params.SellerID,
		buyerID:    params.BuyerID,
		itemID:     params.ItemID,
		startPrice: params.StartPrice,
		soldPrice:  params.SoldPrice,
		status:     params.Status,
		endsAt:     params.EndsAt,
		createdAt:  params.CreatedAt,
		updatedAt:  params.UpdatedAt,
		version:    params.Version,
	}

	return &listing, nil
}
