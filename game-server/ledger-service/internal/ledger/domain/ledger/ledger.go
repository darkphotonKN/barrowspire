package ledger

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrCorruptLedgerState     = errors.New("corrupt ledger state")
	ErrConcurrentModification = errors.New("concurrent modification")
)

// --- Domain ---

// Ledger is the aggregate root of this bounded context.
//
// SCAFFOLD: it carries only identity, birth facts, and the OCC version — the
// structural minimum a DDD aggregate needs to be born, reconstituted, and saved.
// No domain verbs exist yet because the domain is not designed. Entities, value
// objects and invariants get added here (and enforced in Reconstitute) when it is.
type Ledger struct {
	id        uuid.UUID
	memberID  uuid.UUID
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

func NewLedger(memberID uuid.UUID) (*Ledger, error) {
	if memberID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Ledger{
		id:        uuid.New(),
		memberID:  memberID,
		createdAt: time.Now(),
		updatedAt: time.Now(),
		version:   0, // births with 0, all aggregate roots start with 0
	}, nil
}

type ReconstituteParams struct {
	ID        uuid.UUID
	MemberID  uuid.UUID
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Reconstitute rebuilds the aggregate from persisted state.
//
// Cross-field invariant re-validation belongs here — persisted state is not
// trusted, it is re-checked. There is nothing to check yet, so the only failure
// mode is a missing identity; ErrCorruptLedgerState is the sentinel to reach for
// when there is.
func Reconstitute(params ReconstituteParams) (*Ledger, error) {
	if params.ID == uuid.Nil || params.MemberID == uuid.Nil {
		return nil, ErrCorruptLedgerState
	}

	return &Ledger{
		id:        params.ID,
		memberID:  params.MemberID,
		createdAt: params.CreatedAt,
		updatedAt: params.UpdatedAt,
		version:   params.Version,
	}, nil
}

// snapshot exposes fields for external use, with no path to write fields
type LedgerSnapshot struct {
	ID        uuid.UUID
	MemberID  uuid.UUID
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (l *Ledger) Snapshot() LedgerSnapshot {
	return LedgerSnapshot{
		ID:        l.id,
		MemberID:  l.memberID,
		Version:   l.version,
		CreatedAt: l.createdAt,
		UpdatedAt: l.updatedAt,
	}
}
