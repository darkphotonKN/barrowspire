// Package partystore is a party's state in Redis (FS-NCC9J §Requirements 1–3, ADR-0036): the
// party itself, its members in join order, its open invites, and each member's pointer to it. No
// pod is a party's home; every pod reads and changes it here. Every change is one Lua script that
// makes the final check and write, or returns a refusal instead of writing; who may act, and in
// what order the refusals are checked, stays in Go with the caller. It wraps the one go-redis
// client the pod already holds, as partypresence and chatbus do.
package partystore

import (
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// TTL is how long a party outlives the last pod to hold one of its members: every pod holding a
// member puts it back on this each time it re-reads the party (I-NCC9J-1 D5, until FS-NCC9J R17's
// per-member records arrive).
const TTL = 5 * time.Minute

// InviteTTL is how long an invite stays open (FS-NCC9J R12).
const InviteTTL = 60 * time.Second

// inviteRecordTTL is how long an invite's record outlives its opening: long enough that an accept
// a little late is told it expired, rather than nothing.
const inviteRecordTTL = 2 * InviteTTL

// Refusal is why a script did not write: the final check found something changed since the
// caller's own checks. "" means it wrote.
type Refusal string

const (
	RefusalNotLeader      Refusal = "not_leader"
	RefusalPartyFull      Refusal = "party_full"
	RefusalAlreadyInParty Refusal = "already_in_party"
	RefusalPending        Refusal = "pending"
	RefusalExpired        Refusal = "expired"
	RefusalPartyGone      Refusal = "party_gone"
	RefusalNotMember      Refusal = "not_member"
	// RefusalNoInvite: no open invite by that id addressed to whoever answered; the caller ignores it
	RefusalNoInvite Refusal = "no_invite"
)

// Joiner is a player as they come into a party.
type Joiner struct {
	PlayerID uuid.UUID
	Name     string
	Class    string
}

// Member is a party member as the party shows them.
type Member struct {
	PlayerID uuid.UUID
	Name     string
	Class    string
	JoinedAt time.Time
}

// Reservation is an open invite: a slot held for its target until it is answered or expires
// (FS-NCC9J R3).
type Reservation struct {
	InviteID   uuid.UUID
	TargetID   uuid.UUID
	TargetName string
	ExpiresAt  time.Time
}

// Party is a party as it stands in Redis.
type Party struct {
	ID        uuid.UUID
	Leader    uuid.UUID
	CreatedAt time.Time
	// in join order
	Members []Member
	// oldest first
	Reserved []Reservation
}

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

// pointerKey is a player's pointer to their party. Every key carries the {party} hash tag (see
// scripts/lib.lua).
func pointerKey(playerID uuid.UUID) string { return "{party}:pl:" + playerID.String() }

func inviteKey(inviteID uuid.UUID) string { return "{party}:inv:" + inviteID.String() }

func partyKey(partyID uuid.UUID) string { return "{party}:p:" + partyID.String() }
