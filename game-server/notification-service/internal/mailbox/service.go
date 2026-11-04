package mailbox

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Repository is the letter storage the service needs.
type Repository interface {
	InsertLetters(ctx context.Context, tx sqlx.ExtContext, letters []Letter) error
	ListLetters(ctx context.Context, member uuid.UUID, now time.Time, limit int) ([]MailboxLetter, error)
	Summary(ctx context.Context, member uuid.UUID, now time.Time) (Summary, error)
	FindAddressed(ctx context.Context, letterID, member uuid.UUID) (*Letter, error)
	MarkRead(ctx context.Context, letterID, member uuid.UUID, at time.Time) error

	// The claim (ADR-0044): the state row is ensured outside the claim's
	// transaction, then locked, moved and finished inside it.
	EnsureState(ctx context.Context, letterID, member uuid.UUID) error
	LockState(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID) (ClaimState, error)
	StartClaim(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID, at time.Time) error
	FinishClaim(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID) error
}

// Items is what the mailbox needs from items-service: snapshots at send, the
// grant at claim. See items.go.
type Items interface {
	// ResolveItemSnapshots turns item enclosure requests into item snapshots,
	// once, at send (A2).
	ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instanceIDs []uuid.UUID) (*Resolution, error)
	// GrantItems mints the lines into the stash of the member whose token the
	// call forwards, once per grant id (R15, R20). A full stash is the
	// STASH_FULL refusal.
	GrantItems(ctx context.Context, grantID string, lines []ItemGrant) (*Grant, error)
}

// snapshotResolver is the part of Items a send needs: the resolve at send (A2).
type snapshotResolver interface {
	ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instanceIDs []uuid.UUID) (*Resolution, error)
}

// GoldCreditor credits gold to the wallet of the member whose token the call
// forwards, once per key (R16, R23). applied false means the key was already
// credited, which is success. See wallet.go.
type GoldCreditor interface {
	Credit(ctx context.Context, amount int64, key string) (applied bool, err error)
}

// ArrivalPublisher announces letters that were just stored (R41, R50, R62,
// ADR-0045): called after their transaction commits, outside it. Best-effort:
// it answers nothing, bounds itself by a short deadline and logs its own
// failure, so a lost announcement never fails or undoes a send. See arrival.go.
type ArrivalPublisher interface {
	PublishArrivals(ctx context.Context, letters []Letter)
}

// Inbox is the consumer-side idempotency record the letter request needs
// (FS-PJPNA), implemented by common/inbox on this service's processed_events.
// The mark runs on the caller's transaction, beside the letters it guards.
type Inbox interface {
	MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error)
}

// TemplateRef asks for a fresh item of a template. ItemLevel nil means the
// template's min_item_level.
type TemplateRef struct {
	TemplateID uuid.UUID
	ItemLevel  *int32
}

// Resolution answers a resolve: Templates and Instances are index-aligned
// with the request, nil where an id did not resolve; the lists say why.
type Resolution struct {
	Templates          []*ItemSnapshot
	Instances          []*ItemSnapshot
	UnknownTemplateIDs []uuid.UUID
	UnknownInstanceIDs []uuid.UUID
	UnrepresentableIDs []uuid.UUID
}

type service struct {
	repo     Repository
	items    Items
	wallet   GoldCreditor
	arrivals ArrivalPublisher
	inbox    Inbox
	// welcomeGift caches the welcome potion's snapshot once resolved (A8.1).
	welcomeGift potionCache
	// withTx runs fn in one transaction, committing when fn succeeds and
	// rolling back otherwise. Tests run fn without a database.
	withTx func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
	now    func() time.Time
}

func NewService(db *sqlx.DB, repo Repository, items Items, wallet GoldCreditor, arrivals ArrivalPublisher, inbox Inbox) *service {
	return &service{
		repo:     repo,
		items:    items,
		wallet:   wallet,
		arrivals: arrivals,
		inbox:    inbox,
		withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
			return commonutils.ExecTx(ctx, db, nil, fn)
		},
		now: time.Now,
	}
}

// SendLetter stores an admin's official letter (R11, R45-R51): one letter
// per distinct recipient, or one broadcast, all in one transaction. Every
// rule is checked once, before anything is resolved or stored.
func (s *service) SendLetter(ctx context.Context, caller commonauth.Identity, draft LetterDraft) (*SentLetters, error) {
	if caller.Role != commonauth.RoleAdmin {
		return nil, ErrNotAdmin
	}

	letters, err := s.prepareLetters(ctx, draft, officialFrom(caller.MemberID))
	if err != nil {
		return nil, err
	}

	if err := s.withTx(ctx, func(tx *sqlx.Tx) error {
		return s.repo.InsertLetters(ctx, tx, letters)
	}); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrStoreFailed, err)
	}

	// committed: announce outside the transaction; it never fails the send
	s.arrivals.PublishArrivals(ctx, letters)
	return sentLetters(letters), nil
}

// origin is who a send speaks for: the sender kind a reader sees and the
// sent-by audit only operators see (A7.2). Built only by officialFrom and
// systemFrom, so the two always agree, as the letters CHECK demands (R53).
type origin struct {
	sender Sender
	sentBy SentBy
}

// officialFrom is the admin send's origin: the admin is the verified token's
// member, never anything the request names (R55).
func officialFrom(admin uuid.UUID) origin {
	return origin{sender: SenderOfficial, sentBy: SentBy{MemberID: &admin}}
}

// systemFrom is the system path's origin: the letter request's source, or a
// letter trigger's fixed name (R55).
func systemFrom(source SentBySource) origin {
	return origin{sender: SenderSystem, sentBy: SentBy{Source: source}}
}

// prepareLetters checks a draft, resolves its item enclosures once and builds
// the letters to store, one per recipient, identical but for id and member,
// each stamped with from's sender kind and sent-by. Nothing is stored. The
// letter request (I-1GZGD-5) and the welcome (I-1GZGD-11) store their result
// in their own inbox transaction.
func (s *service) prepareLetters(ctx context.Context, draft LetterDraft, from origin) ([]Letter, error) {
	return s.prepareLettersVia(ctx, s.items, draft, from)
}

// prepareLettersVia is prepareLetters resolving through items, so the welcome
// can resolve through its cache (A8.1).
func (s *service) prepareLettersVia(ctx context.Context, items snapshotResolver, draft LetterDraft, from origin) ([]Letter, error) {
	now := s.now()

	recipients, err := recipientsOf(draft.Recipient)
	if err != nil {
		return nil, err
	}
	title, body, err := checkText(draft.Title, draft.Body)
	if err != nil {
		return nil, err
	}
	if err := checkEnclosures(draft.Enclosures); err != nil {
		return nil, err
	}
	expiresAt := now.Add(defaultLetterExpiry)
	if draft.ExpiresAt != nil {
		if !draft.ExpiresAt.After(now) {
			return nil, errcode.Refuse(errcode.LetterExpiryInvalid)
		}
		expiresAt = *draft.ExpiresAt
	}

	enclosures, err := resolve(ctx, items, draft.Enclosures)
	if err != nil {
		return nil, err
	}

	letters := make([]Letter, 0, len(recipients))
	for _, member := range recipients {
		letters = append(letters, Letter{
			ID:         uuid.New(),
			Title:      title,
			Body:       body,
			Sender:     from.sender,
			SentBy:     from.sentBy,
			MemberID:   member,
			Enclosures: enclosures,
			SentAt:     now,
			ExpiresAt:  expiresAt,
		})
	}
	return letters, nil
}

// recipientsOf answers one member id per letter to store, nil for a
// broadcast. A list is de-duplicated in first-appearance order before its
// bounds are checked (R47).
func recipientsOf(r Recipient) ([]*uuid.UUID, error) {
	switch r.Kind {
	case RecipientAllMembers:
		return []*uuid.UUID{nil}, nil
	case RecipientMember:
		if len(r.MemberIDs) != 1 {
			return nil, fmt.Errorf("a one-member send names %d members", len(r.MemberIDs))
		}
		member := r.MemberIDs[0]
		return []*uuid.UUID{&member}, nil
	case RecipientMemberList:
		seen := make(map[uuid.UUID]bool, len(r.MemberIDs))
		members := make([]*uuid.UUID, 0, len(r.MemberIDs))
		for _, id := range r.MemberIDs {
			if seen[id] {
				continue
			}
			seen[id] = true
			member := id
			members = append(members, &member)
		}
		if len(members) == 0 || len(members) > maxListRecipients {
			return nil, errcode.Refuse(errcode.LetterRecipientsInvalid)
		}
		return members, nil
	default:
		return nil, fmt.Errorf("unknown recipient kind %d", r.Kind)
	}
}

// checkText trims title and body and checks their lengths in runes (R3).
func checkText(title, body string) (string, string, error) {
	title, body = strings.TrimSpace(title), strings.TrimSpace(body)
	if n := utf8.RuneCountInString(title); n < 1 || n > maxTitleRunes {
		return "", "", errcode.Refuse(errcode.LetterTitleInvalid)
	}
	if n := utf8.RuneCountInString(body); n < 1 || n > maxBodyRunes {
		return "", "", errcode.Refuse(errcode.LetterBodyInvalid)
	}
	return title, body, nil
}

// checkEnclosures applies S1: at most 10 enclosures, at most one gold, item
// quantities 1-60 summing to at most 60 slots, gold at least 1, and a given
// item level at least 1.
func checkEnclosures(enclosures []EnclosureRequest) error {
	if len(enclosures) > maxEnclosures {
		return errcode.Refuse(errcode.EnclosureInvalid)
	}
	golds, slots := 0, int32(0)
	for _, e := range enclosures {
		switch e.Kind {
		case RequestGold:
			golds++
			if e.Gold < 1 {
				return errcode.Refuse(errcode.EnclosureInvalid)
			}
		case RequestTemplate, RequestCopy:
			if e.Quantity < 1 || e.Quantity > maxItemQuantity {
				return errcode.Refuse(errcode.EnclosureInvalid)
			}
			if e.Kind == RequestTemplate && e.ItemLevel != nil && *e.ItemLevel < 1 {
				return errcode.Refuse(errcode.EnclosureInvalid)
			}
			slots += e.Quantity
		default:
			return errcode.Refuse(errcode.EnclosureInvalid)
		}
	}
	if golds > maxGoldEnclosures || slots > maxSlotCount {
		return errcode.Refuse(errcode.EnclosureInvalid)
	}
	return nil
}

// resolve turns the requests into stored enclosures, in request order, with
// one items call for every item enclosure and none without any (A2, R49).
func resolve(ctx context.Context, items snapshotResolver, requests []EnclosureRequest) ([]Enclosure, error) {
	var templates []TemplateRef
	var instances []uuid.UUID
	for _, e := range requests {
		switch e.Kind {
		case RequestTemplate:
			templates = append(templates, TemplateRef{TemplateID: e.TemplateID, ItemLevel: e.ItemLevel})
		case RequestCopy:
			instances = append(instances, e.CopyOf)
		}
	}

	var res *Resolution
	if len(templates)+len(instances) > 0 {
		var err error
		res, err = items.ResolveItemSnapshots(ctx, templates, instances)
		if err != nil {
			return nil, fmt.Errorf("resolve %d item enclosures: %w", len(templates)+len(instances), err)
		}
		switch {
		case len(res.UnknownTemplateIDs) > 0:
			return nil, errcode.Refuse(errcode.UnknownItemTemplate)
		case len(res.UnknownInstanceIDs) > 0:
			return nil, errcode.Refuse(errcode.UnknownItemInstance)
		case len(res.UnrepresentableIDs) > 0:
			return nil, errcode.Refuse(errcode.EnclosureInvalid)
		}
	}

	enclosures := make([]Enclosure, 0, len(requests))
	nextTemplate, nextInstance := 0, 0
	for _, e := range requests {
		switch e.Kind {
		case RequestGold:
			enclosures = append(enclosures, Enclosure{Kind: EnclosureGold, Gold: e.Gold})
		case RequestTemplate:
			snap, err := resolvedAt(res.Templates, nextTemplate)
			if err != nil {
				return nil, fmt.Errorf("template %s: %w", e.TemplateID, err)
			}
			nextTemplate++
			enclosures = append(enclosures, Enclosure{Kind: EnclosureItem, Quantity: e.Quantity, Item: snap})
		case RequestCopy:
			snap, err := resolvedAt(res.Instances, nextInstance)
			if err != nil {
				return nil, fmt.Errorf("instance %s: %w", e.CopyOf, err)
			}
			nextInstance++
			enclosures = append(enclosures, Enclosure{Kind: EnclosureItem, Quantity: e.Quantity, Item: snap})
		}
	}
	return enclosures, nil
}

// errNotResolved: items answered neither a snapshot nor a reason for an id,
// which breaks its contract.
var errNotResolved = errors.New("items answered no snapshot and no reason")

func resolvedAt(snapshots []*ItemSnapshot, i int) (*ItemSnapshot, error) {
	if i >= len(snapshots) || snapshots[i] == nil {
		return nil, errNotResolved
	}
	return snapshots[i], nil
}

func sentLetters(letters []Letter) *SentLetters {
	sent := &SentLetters{Letters: make([]SentLetter, 0, len(letters))}
	for _, l := range letters {
		sent.Letters = append(sent.Letters, SentLetter{LetterID: l.ID, MemberID: l.MemberID})
		sent.ExpiresAt = l.ExpiresAt
	}
	return sent
}

// ListLetters reads the member's mailbox (R7).
func (s *service) ListLetters(ctx context.Context, member uuid.UUID) ([]MailboxLetter, error) {
	return s.repo.ListLetters(ctx, member, s.now(), mailboxSize)
}

// MailboxSummary counts the member's mailbox (R9).
func (s *service) MailboxSummary(ctx context.Context, member uuid.UUID) (Summary, error) {
	return s.repo.Summary(ctx, member, s.now())
}

// MarkLetterRead marks one letter read for the member (R8): a letter not
// addressed to them is ErrLetterNotFound, an expired one LETTER_EXPIRED.
func (s *service) MarkLetterRead(ctx context.Context, letterID, member uuid.UUID) error {
	letter, err := s.repo.FindAddressed(ctx, letterID, member)
	if err != nil {
		return err
	}
	now := s.now()
	if !letter.ExpiresAt.After(now) {
		return errcode.Refuse(errcode.LetterExpired)
	}
	return s.repo.MarkRead(ctx, letterID, member, now)
}

// claimStepsTimeout bounds the items and wallet calls of one claim together,
// and so how long the claim holds its row lock and connection (ADR-0044
// §Consequences).
const claimStepsTimeout = 10 * time.Second

// ClaimLetter takes every enclosure of one letter for the member (R13-R17,
// ADR-0044): items into the stash, then gold into the wallet, and 'claimed'
// only after both. Refusals come first and call nothing: not addressed is
// ErrLetterNotFound, then LETTER_EXPIRED, NOTHING_TO_CLAIM, and, under the
// row lock, LETTER_CLAIM_IN_PROGRESS and LETTER_ALREADY_CLAIMED (R25, S5).
//
// The lock is held across both steps. A step failure still commits the move
// to 'claiming' and the read, so the next claim re-drives both steps with the
// same keys (R27, R28); a crash rolls back to the earlier state, which the
// next claim re-drives just the same.
func (s *service) ClaimLetter(ctx context.Context, letterID, member uuid.UUID) (*Claim, error) {
	letter, err := s.repo.FindAddressed(ctx, letterID, member)
	if err != nil {
		return nil, err
	}
	now := s.now()
	if !letter.ExpiresAt.After(now) {
		return nil, errcode.Refuse(errcode.LetterExpired)
	}
	if len(letter.Enclosures) == 0 {
		return nil, errcode.Refuse(errcode.NothingToClaim)
	}
	if err := s.repo.EnsureState(ctx, letterID, member); err != nil {
		return nil, err
	}

	var (
		claim    *Claim
		stepsErr error
	)
	err = s.withTx(ctx, func(tx *sqlx.Tx) error {
		state, err := s.repo.LockState(ctx, tx, letterID, member)
		switch {
		case errors.Is(err, ErrStateLocked):
			return errcode.Refuse(errcode.LetterClaimInProgress)
		case err != nil:
			return err
		case state == ClaimClaimed:
			return errcode.Refuse(errcode.LetterAlreadyClaimed)
		}

		if err := s.repo.StartClaim(ctx, tx, letterID, member, now); err != nil {
			return err
		}
		claim, stepsErr = s.claimSteps(ctx, letter, member)
		if stepsErr != nil {
			// commit 'claiming': the next claim finishes it
			return nil
		}
		return s.repo.FinishClaim(ctx, tx, letterID, member)
	})
	if err != nil {
		return nil, err
	}
	if stepsErr != nil {
		return nil, stepsErr
	}
	return claim, nil
}

// claimKey is both steps' idempotency key (R14, ADR-0009): the grant id and
// the credit key. Derived from letter id + member id only, so every attempt of
// one claim carries the same key, and the member is the one whose token the
// steps forward.
func claimKey(letterID, member uuid.UUID) string {
	return "mail:" + letterID.String() + ":" + member.String()
}

// claimSteps runs step 1 (items, if any) then step 2 (gold, if any) under one
// deadline. A done step answers already granted or already applied, which
// counts as success.
func (s *service) claimSteps(ctx context.Context, letter *Letter, member uuid.UUID) (*Claim, error) {
	ctx, cancel := context.WithTimeout(ctx, claimStepsTimeout)
	defer cancel()

	key := claimKey(letter.ID, member)
	claim := &Claim{LetterID: letter.ID, ItemIDs: []uuid.UUID{}}
	var lines []ItemGrant
	for _, e := range letter.Enclosures {
		switch e.Kind {
		case EnclosureItem:
			if e.Item == nil {
				return nil, fmt.Errorf("letter %s holds an item enclosure without a snapshot", letter.ID)
			}
			lines = append(lines, ItemGrant{Snapshot: e.Item, Quantity: e.Quantity})
		case EnclosureGold:
			claim.Gold += e.Gold
		}
	}

	if len(lines) > 0 {
		grant, err := s.items.GrantItems(ctx, key, lines)
		if err != nil {
			return nil, fmt.Errorf("grant the items of letter %s: %w", letter.ID, err)
		}
		claim.ItemIDs = grant.ItemIDs
	}
	if claim.Gold > 0 {
		if _, err := s.wallet.Credit(ctx, claim.Gold, key); err != nil {
			return nil, fmt.Errorf("credit the gold of letter %s: %w", letter.ID, err)
		}
	}
	return claim, nil
}
