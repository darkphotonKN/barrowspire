package listing

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrCorruptListingState    = errors.New("corrupt listing state")
	ErrConcurrentModification = errors.New("concurrent modification")
)

type ListingStatus string

const (
	StatusActive    ListingStatus = "ACTIVE"
	StatusWithdrawn ListingStatus = "WITHDRAWN"
	StatusSold      ListingStatus = "SOLD"
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

const listingDuration = time.Hour * 24

func NewListing(sellerID, itemID uuid.UUID, startPrice int, endsAt time.Time) (*Listing, error) {
	if sellerID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Listing{
		id:         uuid.New(),
		sellerID:   sellerID,
		buyerID:    nil,
		itemID:     itemID,
		startPrice: startPrice,
		soldPrice:  nil,
		status:     StatusActive,
		endsAt:     time.Now().Add(listingDuration),
		createdAt:  time.Now(),
		updatedAt:  time.Now(),
		version:    0, // births with 0, all aggregate roots start with 0
	}, nil
}

func (a *Listing) Snapshot() ListingSnapshot {
	return ListingSnapshot{
		ID:         a.id,
		SellerID:   a.sellerID,
		BuyerID:    a.buyerID,
		ItemID:     a.itemID,
		StartPrice: a.startPrice,
		SoldPrice:  a.soldPrice,
		Status:     a.status,
		EndsAt:     a.endsAt,
		Version:    a.version,
		CreatedAt:  a.createdAt,
		UpdatedAt:  a.updatedAt,
	}
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
	account := Listing{
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

	return &account, nil
}
