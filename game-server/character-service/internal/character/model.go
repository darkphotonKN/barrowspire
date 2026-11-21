package character

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/google/uuid"
)

// Character is a member's character (FS-BDA7X R1–R2). PlayerID is the owning
// member; Exp is total experience and never decreases.
type Character struct {
	ID        uuid.UUID  `db:"id"`
	PlayerID  uuid.UUID  `db:"player_id"`
	ClassID   string     `db:"class_id"`
	Name      string     `db:"name"`
	Level     int32      `db:"level"`
	Exp       int64      `db:"exp"`
	CreatedAt time.Time  `db:"created_at"`
	UpdatedAt time.Time  `db:"updated_at"`
	DeletedAt *time.Time `db:"deleted_at"`
	// PassiveRanks is the passive tree nodes held at rank 1 or more (FS-8RZ51
	// R14), read from passive_ranks beside the row.
	PassiveRanks passivetree.Ranks `db:"-"`
	// Specialization is the spec id the held tier-6 node grants, empty
	// before the pick (FS-E1ZDG R4). The service derives it on every read;
	// it is never stored.
	Specialization string `db:"-"`
}

// CharacterCreate is what a member supplies to create a character.
type CharacterCreate struct {
	MemberID uuid.UUID
	Name     string
	Class    string
}

// ExperienceGrant is what one run earned one member's character, applied once:
// it is keyed by the run's session and the character. FS-BDA7X §Requirements
// 25–27.
type ExperienceGrant struct {
	SessionID   uuid.UUID
	CharacterID uuid.UUID
	MemberID    uuid.UUID
	Amount      int64
}

// PassiveSpend is a member taking one rank of a passive tree node for one of
// their characters. Rank is the target, the rank held plus one, and is the
// idempotency key: a target already held is a no-op (ADR-0083).
type PassiveSpend struct {
	MemberID    uuid.UUID
	CharacterID uuid.UUID
	NodeID      string
	Rank        int
}

// PassiveSpendResult is a spend's answer: whether it wrote the rank, and every
// rank the character holds after it.
type PassiveSpendResult struct {
	Applied bool
	Ranks   passivetree.Ranks
}

type CreateCharacterEvent struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
