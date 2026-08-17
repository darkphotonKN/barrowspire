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

type Listing struct {
	id        uuid.UUID
	memberID  uuid.UUID
	name      string
	createdAt time.Time
	updatedAt time.Time

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
	ID        uuid.UUID
	MemberID  uuid.UUID
	Name      string
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewListing(memberID uuid.UUID, name string) (*Listing, error) {
	if memberID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Listing{
		id:        uuid.New(),
		memberID:  memberID,
		name:      name, // new accounts always start with 0 gold
		createdAt: time.Now(),
		updatedAt: time.Now(),
		version:   0, // births with 0, all aggregate roots start with 0
	}, nil
}

func (a *Listing) Snapshot() ListingSnapshot {
	// holds := make([]WalletHoldSnapshot, 0, len(a.holds))

	return ListingSnapshot{
		ID:        a.id,
		MemberID:  a.memberID,
		Name:      a.name,
		Version:   a.version,
		CreatedAt: a.createdAt,
		UpdatedAt: a.updatedAt,
	}
}

type ReconstituteParams struct {
	ID        uuid.UUID
	MemberID  uuid.UUID
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func Reconstitute(params ReconstituteParams) (*Listing, error) {

	// reconstitute core account from params and validated holds
	account := Listing{
		id:        params.ID,
		memberID:  params.MemberID,
		createdAt: params.CreatedAt,
		updatedAt: params.UpdatedAt,
		version:   params.Version,
	}

	return &account, nil
}
