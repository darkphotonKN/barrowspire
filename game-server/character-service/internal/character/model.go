package character

import (
	"time"

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

type CreateCharacterEvent struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
