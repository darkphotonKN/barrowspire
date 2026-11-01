package partystore

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

//go:embed scripts/lib.lua
var lib string

//go:embed scripts/invite.lua
var inviteLua string

//go:embed scripts/accept.lua
var acceptLua string

//go:embed scripts/decline.lua
var declineLua string

//go:embed scripts/create.lua
var createLua string

//go:embed scripts/read.lua
var readLua string

//go:embed scripts/refresh.lua
var refreshLua string

//go:embed scripts/remove.lua
var removeLua string

//go:embed scripts/transfer.lua
var transferLua string

// script is one party script with the shared library in front of it.
func script(body string) *redis.Script { return redis.NewScript(lib + "\n" + body) }

var (
	inviteScript   = script(inviteLua)
	acceptScript   = script(acceptLua)
	declineScript  = script(declineLua)
	createScript   = script(createLua)
	readScript     = script(readLua)
	refreshScript  = script(refreshLua)
	removeScript   = script(removeLua)
	transferScript = script(transferLua)
)

// reply is what every script returns, JSON-encoded.
type reply struct {
	Code   string     `json:"code"`
	Formed bool       `json:"formed"`
	Party  *wireParty `json:"party"`
	Voided []wireVoid `json:"voided"`
	// the invite's target, on a decline or withdrawal
	TargetName string `json:"target_name"`
	// the change ended the party
	Ended bool `json:"ended"`
	// a removal passed the lead on
	Succeeded bool `json:"succeeded"`
	// a refresh: the parties that stand, and the ids of those that have ended
	Parties []wireParty `json:"parties"`
	Gone    []string    `json:"gone"`
}

type wireVoid struct {
	InviteID   string    `json:"invite_id"`
	PartyID    string    `json:"party_id"`
	LeaderID   string    `json:"leader_id"`
	TargetName string    `json:"target_name"`
	Party      wireParty `json:"party"`
}

type wireParty struct {
	Version   string            `json:"version"`
	ID        string            `json:"id"`
	Leader    string            `json:"leader"`
	CreatedAt string            `json:"created_at"`
	Members   []wireMember      `json:"members"`
	Reserved  []wireReservation `json:"reserved"`
}

type wireMember struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
	Class    string `json:"class"`
	JoinedAt string `json:"joined_at"`
}

type wireReservation struct {
	InviteID   string `json:"invite_id"`
	TargetID   string `json:"target_id"`
	TargetName string `json:"target_name"`
	ExpiresAt  string `json:"expires_at"`
}

// run runs s and decodes its reply; a refusal is a reply, not an error.
func run(ctx context.Context, s *redis.Script, c redis.UniversalClient, keys []string, args ...any) (reply, error) {
	raw, err := s.Run(ctx, c, keys, args...).Text()
	if err != nil {
		return reply{}, err
	}
	var r reply
	if err := json.Unmarshal([]byte(raw), &r); err != nil {
		return reply{}, fmt.Errorf("decode script reply: %w", err)
	}
	return r, nil
}

// refusal is the reply's refusal, "" when the script wrote.
func (r reply) refusal() Refusal {
	if r.Code == "ok" {
		return ""
	}
	return Refusal(r.Code)
}

func millis(t time.Time) string { return strconv.FormatInt(t.UnixMilli(), 10) }

func ttlMillis(d time.Duration) string { return strconv.FormatInt(d.Milliseconds(), 10) }

func fromMillis(s string) (time.Time, error) {
	ms, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse time %q: %w", s, err)
	}
	return time.UnixMilli(ms).UTC(), nil
}

// party is the reply's party in Go's terms.
func (w *wireParty) party() (Party, error) {
	id, err := uuid.Parse(w.ID)
	if err != nil {
		return Party{}, fmt.Errorf("parse party id: %w", err)
	}
	leader, err := uuid.Parse(w.Leader)
	if err != nil {
		return Party{}, fmt.Errorf("parse leader of %s: %w", id, err)
	}
	created, err := fromMillis(w.CreatedAt)
	if err != nil {
		return Party{}, fmt.Errorf("party %s: %w", id, err)
	}
	version, err := strconv.ParseInt(w.Version, 10, 64)
	if err != nil {
		return Party{}, fmt.Errorf("parse version of %s: %w", id, err)
	}
	p := Party{ID: id, Leader: leader, CreatedAt: created, Version: version}
	for _, m := range w.Members {
		playerID, err := uuid.Parse(m.PlayerID)
		if err != nil {
			return Party{}, fmt.Errorf("parse member of %s: %w", id, err)
		}
		joined, err := fromMillis(m.JoinedAt)
		if err != nil {
			return Party{}, fmt.Errorf("member of %s: %w", id, err)
		}
		p.Members = append(p.Members, Member{PlayerID: playerID, Name: m.Name, Class: m.Class, JoinedAt: joined})
	}
	for _, r := range w.Reserved {
		inviteID, err := uuid.Parse(r.InviteID)
		if err != nil {
			return Party{}, fmt.Errorf("parse invite of %s: %w", id, err)
		}
		target, err := uuid.Parse(r.TargetID)
		if err != nil {
			return Party{}, fmt.Errorf("parse invite target of %s: %w", id, err)
		}
		expires, err := fromMillis(r.ExpiresAt)
		if err != nil {
			return Party{}, fmt.Errorf("invite of %s: %w", id, err)
		}
		p.Reserved = append(p.Reserved, Reservation{InviteID: inviteID, TargetID: target, TargetName: r.TargetName, ExpiresAt: expires})
	}
	return p, nil
}

// InviteArgs is one invite: from Inviter, to the target, at Size, sent at Now. NewPartyID is the
// party's id if the inviter leads none yet and the invite creates it.
type InviteArgs struct {
	NewPartyID uuid.UUID
	Inviter    Joiner
	InviteID   uuid.UUID
	TargetID   uuid.UUID
	TargetName string
	Size       int
	Now        time.Time
}

// InviteResult is an invite's outcome: refused, or written, with the party as it now stands and
// whether this invite created it.
type InviteResult struct {
	Refusal Refusal
	Formed  bool
	Party   Party
}

// Invite reserves a slot in the inviter's party for the target, creating the party if the inviter
// has none (FS-NCC9J R3, R10). Refused not_leader, party_full, already_in_party or pending when the
// final check fails.
func (r *Redis) Invite(ctx context.Context, a InviteArgs) (InviteResult, error) {
	res, err := run(ctx, inviteScript, r.client,
		[]string{pointerKey(a.Inviter.PlayerID), pointerKey(a.TargetID)},
		a.NewPartyID.String(), a.Inviter.PlayerID.String(), a.Inviter.Name, a.Inviter.Class,
		a.InviteID.String(), a.TargetID.String(), a.TargetName,
		a.Size, millis(a.Now), millis(a.Now.Add(InviteTTL)), ttlMillis(inviteRecordTTL), ttlMillis(TTL),
	)
	if err != nil {
		return InviteResult{}, fmt.Errorf("invite %s: %w", a.TargetID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return InviteResult{Refusal: refusal}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return InviteResult{}, fmt.Errorf("invite %s: %w", a.TargetID, err)
	}
	return InviteResult{Formed: res.Formed, Party: p}, nil
}

// AcceptArgs is one accept: Accepter answering InviteID at Now.
type AcceptArgs struct {
	InviteID uuid.UUID
	Accepter Joiner
	Now      time.Time
}

// Voided is another party's invite an accept spent: whose it was, so its leader can be told, and
// that party as it now stands, so its members can be (FS-NCC9J R21).
type Voided struct {
	InviteID   uuid.UUID
	PartyID    uuid.UUID
	LeaderID   uuid.UUID
	TargetID   uuid.UUID
	TargetName string
	Party      Party
}

// AcceptResult is an accept's outcome: refused, or the party the accepter joined and the other
// invites the accept voided.
type AcceptResult struct {
	Refusal Refusal
	Party   Party
	Voided  []Voided
}

// Accept makes the invite's target a member of its party, spending the invite and every other
// open invite to them (FS-NCC9J R14). Refused no_invite (no such invite, or not theirs), expired,
// party_gone or already_in_party.
func (r *Redis) Accept(ctx context.Context, a AcceptArgs) (AcceptResult, error) {
	res, err := run(ctx, acceptScript, r.client,
		[]string{inviteKey(a.InviteID), pointerKey(a.Accepter.PlayerID)},
		a.InviteID.String(), a.Accepter.PlayerID.String(), a.Accepter.Name, a.Accepter.Class,
		millis(a.Now), ttlMillis(TTL),
	)
	if err != nil {
		return AcceptResult{}, fmt.Errorf("accept invite %s: %w", a.InviteID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return AcceptResult{Refusal: refusal}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return AcceptResult{}, fmt.Errorf("accept invite %s: %w", a.InviteID, err)
	}
	out := AcceptResult{Party: p}
	for _, v := range res.Voided {
		voided, err := v.voided(a.Accepter.PlayerID)
		if err != nil {
			return AcceptResult{}, fmt.Errorf("accept invite %s: %w", a.InviteID, err)
		}
		out.Voided = append(out.Voided, voided)
	}
	return out, nil
}

func (w wireVoid) voided(target uuid.UUID) (Voided, error) {
	inviteID, err := uuid.Parse(w.InviteID)
	if err != nil {
		return Voided{}, fmt.Errorf("parse voided invite: %w", err)
	}
	partyID, err := uuid.Parse(w.PartyID)
	if err != nil {
		return Voided{}, fmt.Errorf("parse voided invite's party: %w", err)
	}
	leader, err := uuid.Parse(w.LeaderID)
	if err != nil {
		return Voided{}, fmt.Errorf("parse voided invite's leader: %w", err)
	}
	p, err := w.Party.party()
	if err != nil {
		return Voided{}, fmt.Errorf("voided invite's party: %w", err)
	}
	return Voided{InviteID: inviteID, PartyID: partyID, LeaderID: leader, TargetID: target, TargetName: w.TargetName, Party: p}, nil
}

// DeclineArgs is one decline: DeclinerID refusing InviteID at Now.
type DeclineArgs struct {
	InviteID   uuid.UUID
	DeclinerID uuid.UUID
	Now        time.Time
}

// DeclineResult is a decline's outcome: refused no_invite, or the party as it now stands and the
// name of the target, for the notice its leader gets.
type DeclineResult struct {
	Refusal    Refusal
	Party      Party
	TargetName string
}

// Decline spends the invite and frees its slot (FS-NCC9J R13). Refused no_invite when there is no
// open invite by that id addressed to the decliner, or its party has ended.
func (r *Redis) Decline(ctx context.Context, a DeclineArgs) (DeclineResult, error) {
	res, err := run(ctx, declineScript, r.client, []string{inviteKey(a.InviteID)},
		a.InviteID.String(), a.DeclinerID.String(), millis(a.Now), "0",
	)
	if err != nil {
		return DeclineResult{}, fmt.Errorf("decline invite %s: %w", a.InviteID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return DeclineResult{Refusal: refusal}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return DeclineResult{}, fmt.Errorf("decline invite %s: %w", a.InviteID, err)
	}
	return DeclineResult{Party: p, TargetName: res.TargetName}, nil
}

// WithdrawResult is a withdrawal's outcome: the party ended with the invite, or the party as it
// now stands without it. Neither, when there was nothing left to withdraw.
type WithdrawResult struct {
	Ended bool
	// zero when the party ended or nothing was withdrawn
	Party Party
}

// Withdraw spends an invite that never reached its target (I-NCC9J-1 D6). With endIfAlone, the
// invite created its party, and the party ends with it if nothing else has joined or been invited
// since.
func (r *Redis) Withdraw(ctx context.Context, inviteID uuid.UUID, endIfAlone bool, now time.Time) (WithdrawResult, error) {
	flag := "0"
	if endIfAlone {
		flag = "1"
	}
	res, err := run(ctx, declineScript, r.client, []string{inviteKey(inviteID)}, inviteID.String(), "", millis(now), flag)
	if err != nil {
		return WithdrawResult{}, fmt.Errorf("withdraw invite %s: %w", inviteID, err)
	}
	if res.Ended || res.Party == nil {
		return WithdrawResult{Ended: res.Ended}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return WithdrawResult{}, fmt.Errorf("withdraw invite %s: %w", inviteID, err)
	}
	return WithdrawResult{Party: p}, nil
}

// CreateResult is a create's outcome: refused already_in_party, or the new party.
type CreateResult struct {
	Refusal Refusal
	Party   Party
}

// Create makes creator the leader of a new party of one, partyID (FS-NCC9J R15).
func (r *Redis) Create(ctx context.Context, partyID uuid.UUID, creator Joiner, now time.Time) (CreateResult, error) {
	res, err := run(ctx, createScript, r.client, []string{pointerKey(creator.PlayerID)},
		partyID.String(), creator.PlayerID.String(), creator.Name, creator.Class, millis(now), ttlMillis(TTL),
	)
	if err != nil {
		return CreateResult{}, fmt.Errorf("create party for %s: %w", creator.PlayerID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return CreateResult{Refusal: refusal}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return CreateResult{}, fmt.Errorf("create party for %s: %w", creator.PlayerID, err)
	}
	return CreateResult{Party: p}, nil
}

// PartyOf reads the party playerID is in, if any, and keeps it alive: the read a pod makes when a
// member is seated on it (FS-NCC9J R6).
func (r *Redis) PartyOf(ctx context.Context, playerID uuid.UUID, now time.Time) (Party, bool, error) {
	p, found, err := r.read(ctx, pointerKey(playerID), "", playerID.String(), now)
	if err != nil {
		return Party{}, false, fmt.Errorf("read party of %s: %w", playerID, err)
	}
	return p, found, nil
}

// RefreshAll reads every party in ids in one trip and keeps each alive: the re-read a pod makes
// every ten seconds of the parties in its cache (FS-NCC9J R4). gone are the ids of parties that
// have ended.
func (r *Redis) RefreshAll(ctx context.Context, ids []uuid.UUID, now time.Time) (parties []Party, gone []uuid.UUID, err error) {
	if len(ids) == 0 {
		return nil, nil, nil
	}
	keys := make([]string, len(ids))
	args := make([]any, 0, len(ids)+2)
	args = append(args, millis(now), ttlMillis(TTL))
	for i, id := range ids {
		keys[i] = partyKey(id)
		args = append(args, id.String())
	}
	res, err := run(ctx, refreshScript, r.client, keys, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("refresh %d parties: %w", len(ids), err)
	}
	for _, w := range res.Parties {
		p, err := w.party()
		if err != nil {
			return nil, nil, fmt.Errorf("refresh %d parties: %w", len(ids), err)
		}
		parties = append(parties, p)
	}
	for _, raw := range res.Gone {
		id, err := uuid.Parse(raw)
		if err != nil {
			return nil, nil, fmt.Errorf("refresh: parse ended party id: %w", err)
		}
		gone = append(gone, id)
	}
	return parties, gone, nil
}

func (r *Redis) read(ctx context.Context, key, partyID, member string, now time.Time) (Party, bool, error) {
	res, err := run(ctx, readScript, r.client, []string{key}, partyID, member, millis(now), ttlMillis(TTL))
	if err != nil {
		return Party{}, false, err
	}
	if res.refusal() != "" {
		return Party{}, false, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return Party{}, false, err
	}
	return p, true, nil
}

// RemoveArgs is one removal: PlayerID leaving PartyID, or kicked by Kicker when Kicker is set.
type RemoveArgs struct {
	PartyID  uuid.UUID
	PlayerID uuid.UUID
	Kicker   uuid.UUID
}

// RemoveResult is a removal's outcome: refused, the party ended, or the party without them and
// whether the lead passed.
type RemoveResult struct {
	Refusal   Refusal
	Ended     bool
	Succeeded bool
	Party     Party
}

// Remove takes a member out of the party, with succession if they led (FS-NCC9J R16). Refused
// not_leader (a kick by anyone but the leader) or not_member.
func (r *Redis) Remove(ctx context.Context, a RemoveArgs) (RemoveResult, error) {
	kicker := ""
	if a.Kicker != uuid.Nil {
		kicker = a.Kicker.String()
	}
	res, err := run(ctx, removeScript, r.client, []string{partyKey(a.PartyID), pointerKey(a.PlayerID)},
		a.PartyID.String(), a.PlayerID.String(), kicker, ttlMillis(TTL),
	)
	if err != nil {
		return RemoveResult{}, fmt.Errorf("remove %s from party %s: %w", a.PlayerID, a.PartyID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return RemoveResult{Refusal: refusal}, nil
	}
	if res.Ended {
		return RemoveResult{Ended: true}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return RemoveResult{}, fmt.Errorf("remove %s from party %s: %w", a.PlayerID, a.PartyID, err)
	}
	return RemoveResult{Succeeded: res.Succeeded, Party: p}, nil
}

// TransferResult is a transfer's outcome: refused, or the party under its new leader.
type TransferResult struct {
	Refusal Refusal
	Party   Party
}

// Transfer hands the lead of partyID from leader to target (FS-NCC9J R16). Refused not_leader or
// not_member.
func (r *Redis) Transfer(ctx context.Context, partyID, leader, target uuid.UUID) (TransferResult, error) {
	res, err := run(ctx, transferScript, r.client, []string{partyKey(partyID)},
		partyID.String(), leader.String(), target.String(), ttlMillis(TTL),
	)
	if err != nil {
		return TransferResult{}, fmt.Errorf("transfer party %s: %w", partyID, err)
	}
	if refusal := res.refusal(); refusal != "" {
		return TransferResult{Refusal: refusal}, nil
	}
	p, err := res.Party.party()
	if err != nil {
		return TransferResult{}, fmt.Errorf("transfer party %s: %w", partyID, err)
	}
	return TransferResult{Party: p}, nil
}
