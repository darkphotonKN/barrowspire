package member

import (
	"time"

	"github.com/google/uuid"
)

type MemberUpdatePasswordParams struct {
	ID       uuid.UUID `db:"id" json:"id"`
	Password string    `db:"password" json:"password"`
}

type MemberUpdateInfoParams struct {
	ID     uuid.UUID `db:"id" json:"id"`
	Name   string    `db:"name" json:"name"`
	Status string    `db:"status" json:"status"`
}

type CreateDefaultMember struct {
	ID       uuid.UUID `db:"id"`
	Email    string    `db:"email"`
	Name     string    `db:"name"`
	Password string    `db:"password"`
	Status   int       `db:"status"`
}

// VerificationCode is a member's one live verification code (FS-V6SFK
// §Requirements 11). CodeHash is SHA-256(member id + code); the plaintext is
// never stored.
type VerificationCode struct {
	MemberID      uuid.UUID `db:"member_id"`
	CodeHash      []byte    `db:"code_hash"`
	ExpiresAt     time.Time `db:"expires_at"`
	WrongAttempts int       `db:"wrong_attempts"`
	IssuedAt      time.Time `db:"issued_at"`
}
