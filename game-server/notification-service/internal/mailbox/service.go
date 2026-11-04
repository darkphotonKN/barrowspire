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
}

// SnapshotResolver turns item enclosure requests into item snapshots, once,
// at send (A2). items-service behind it; see items.go.
type SnapshotResolver interface {
	ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instanceIDs []uuid.UUID) (*Resolution, error)
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
	repo  Repository
	items SnapshotResolver
	// withTx runs fn in one transaction, committing when fn succeeds and
	// rolling back otherwise. Tests run fn without a database.
	withTx func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
	now    func() time.Time
}

func NewService(db *sqlx.DB, repo Repository, items SnapshotResolver) *service {
	return &service{
		repo:  repo,
		items: items,
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

	letters, err := s.prepareLetters(ctx, draft, SenderOfficial)
	if err != nil {
		return nil, err
	}

	if err := s.withTx(ctx, func(tx *sqlx.Tx) error {
		return s.repo.InsertLetters(ctx, tx, letters)
	}); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrStoreFailed, err)
	}

	// Committed. The mail:arrived publish (I-1GZGD-8, ADR-0045) goes here:
	// after the commit, outside the transaction, never failing the send.
	return sentLetters(letters), nil
}

// prepareLetters checks a draft, resolves its item enclosures once and builds
// the letters to store, one per recipient, identical but for id and member.
// Nothing is stored. The letter request (I-1GZGD-5) stores its result in its
// own inbox transaction.
func (s *service) prepareLetters(ctx context.Context, draft LetterDraft, sender Sender) ([]Letter, error) {
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

	enclosures, err := s.resolve(ctx, draft.Enclosures)
	if err != nil {
		return nil, err
	}

	letters := make([]Letter, 0, len(recipients))
	for _, member := range recipients {
		letters = append(letters, Letter{
			ID:         uuid.New(),
			Title:      title,
			Body:       body,
			Sender:     sender,
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
func (s *service) resolve(ctx context.Context, requests []EnclosureRequest) ([]Enclosure, error) {
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
		res, err = s.items.ResolveItemSnapshots(ctx, templates, instances)
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
