// Package partystore is a party's state in Redis (FS-NCC9J §Requirements 1–3, ADR-0037): the
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
// member puts it back on this each time it re-reads the party (I-NCC9J-1 D5).
const TTL = 5 * time.Minute

// RecordTTL is how long a member's record lasts without a refresh before they are removed
// (FS-NCC9J R17).
const RecordTTL = 5 * time.Minute

// AwayAfter is how long a member's record goes without a refresh before they show away
// (FS-NCC9J R17, amended): 30 s and one ten-second refresh interval more, since it counts from
// the last refresh, not from the drop. A drop under 30 s never shows away, wherever it falls
// between refreshes; a member really gone shows away 30 to 40 s after they dropped.
const AwayAfter = 40 * time.Second

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

// Member is a party member as the party shows them. The JSON names are the party's form between
// pods (a party_update letter carries it), fixed so a renamed field cannot quietly change it.
type Member struct {
	PlayerID uuid.UUID `json:"player_id"`
	Name     string    `json:"name"`
	Class    string    `json:"class"`
	JoinedAt time.Time `json:"joined_at"`
	// their record has gone AwayAfter without a refresh (R17)
	Away bool `json:"away"`
	// when the pod holding them last refreshed their record
	SeenAt time.Time `json:"seen_at"`
}

// Swept is what keeping a party's member records changed (FS-NCC9J R17): the members removed as
// their records expired, in join order, whether the lead passed with them, and the members who
// went away or came back.
type Swept struct {
	Removed   []uuid.UUID
	Succeeded bool
	Flipped   []uuid.UUID
}

// Changed reports whether keeping the records changed anything.
func (s Swept) Changed() bool { return len(s.Removed) > 0 || len(s.Flipped) > 0 }

// Reservation is an open invite: a slot held for its target until it is answered or expires
// (FS-NCC9J R3).
type Reservation struct {
	InviteID   uuid.UUID `json:"invite_id"`
	TargetID   uuid.UUID `json:"target_id"`
	TargetName string    `json:"target_name"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// Party is a party as it stands in Redis.
type Party struct {
	ID        uuid.UUID `json:"id"`
	Leader    uuid.UUID `json:"leader"`
	CreatedAt time.Time `json:"created_at"`
	// moves on by one with every change written, so an older copy of the party can be told from a
	// newer one; 0 for a party that has ended
	Version int64 `json:"version"`
	// in join order
	Members []Member `json:"members"`
	// oldest first
	Reserved []Reservation `json:"reserved"`
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

// playerInvitesKey is the invites addressed to a player, scored by expiry (lib.lua's
// player_invites_key).
func playerInvitesKey(playerID uuid.UUID) string { return pointerKey(playerID) + ":invites" }

func inviteKey(inviteID uuid.UUID) string { return "{party}:inv:" + inviteID.String() }

func partyKey(partyID uuid.UUID) string { return "{party}:p:" + partyID.String() }
