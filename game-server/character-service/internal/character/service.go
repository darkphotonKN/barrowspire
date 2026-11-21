package character

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

// maxNameLength matches characters.name VARCHAR(32), counted in characters.
const maxNameLength = 32

// classes is the closed set a character may be (FS-BDA7X R3; FS-MAMHR R4).
var classes = map[string]bool{"warrior": true, "mage": true, "archer": true, "mercenary": true}

// splitsAName reports whether r would break a name in two. U+FEFF counts although Go's
// unicode.IsSpace leaves it out, because the client's whisper parse (JS \s) splits on it.
func splitsAName(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' }

// withSpecialization sets c's specialization from the tier-6 node it holds,
// through the shared table (FS-E1ZDG R4, R7): none before the pick, and none
// for a node of another class.
func withSpecialization(c *Character) *Character {
	c.Specialization, _ = passivetree.SpecializationOf(c.ClassID, c.PassiveRanks)
	return c
}

type service struct {
	repo      Repository
	publishCh *amqp.Channel
}

// Repository is what the service needs from persistence. Every read and delete
// is scoped by the owning member; a miss (another member's, deleted, unknown)
// is commonconstants.ErrNotFound, and a taken name is ErrDuplicateResource.
type Repository interface {
	Create(ctx context.Context, character *Character) (*Character, error)
	ListByPlayer(ctx context.Context, playerID uuid.UUID) ([]*Character, error)
	GetByPlayer(ctx context.Context, playerID, id uuid.UUID) (*Character, error)
	SoftDelete(ctx context.Context, playerID, id uuid.UUID) error
	// ApplyExperienceGrant records the grant and applies it to the member's
	// live character in one transaction. A grant already recorded is
	// ErrAlreadyProcessed; a character that is not the member's live one is
	// ErrNotFound. Either way nothing changes.
	ApplyExperienceGrant(ctx context.Context, grant ExperienceGrant, apply func(*Character)) (*Character, error)
	// SpendPassivePoint locks the member's live character, reads its ranks
	// onto it and asks decide whether to write the spend's rank; the
	// character comes back with the ranks held after. decide's error is
	// returned as is with nothing written; a character that is not the
	// member's live one is ErrNotFound.
	SpendPassivePoint(ctx context.Context, spend PassiveSpend, decide func(*Character) (bool, error)) (*Character, error)
}

func NewService(repo Repository, ch *amqp.Channel) *service {
	return &service{repo: repo, publishCh: ch}
}

func (s *service) CreateCharacter(ctx context.Context, in CharacterCreate) (*Character, error) {
	name := strings.TrimSpace(in.Name)
	if in.MemberID == uuid.Nil {
		return nil, fmt.Errorf("create character: member required: %w", commonconstants.ErrInvalidInput)
	}
	if !classes[in.Class] {
		return nil, fmt.Errorf("create character: unknown class %q: %w", in.Class, commonconstants.ErrInvalidInput)
	}
	if n := utf8.RuneCountInString(name); n < 1 || n > maxNameLength {
		return nil, fmt.Errorf("create character: name must be 1-%d characters: %w", maxNameLength, commonconstants.ErrInvalidInput)
	}
	// one word, so a whisper's "@Name message" finds the whole name (FS-KCQ06 R17)
	if strings.IndexFunc(name, splitsAName) >= 0 {
		return nil, fmt.Errorf("create character: A hero's name is one word.: %w", commonconstants.ErrInvalidInput)
	}

	created, err := s.repo.Create(ctx, &Character{
		ID:       uuid.New(),
		PlayerID: in.MemberID,
		ClassID:  in.Class,
		Name:     name,
	})
	if err != nil {
		return nil, fmt.Errorf("create character: %w", err)
	}
	return withSpecialization(created), nil
}

func (s *service) ListCharacters(ctx context.Context, memberID uuid.UUID) ([]*Character, error) {
	characters, err := s.repo.ListByPlayer(ctx, memberID)
	if err != nil {
		return nil, fmt.Errorf("list characters: %w", err)
	}
	for _, c := range characters {
		withSpecialization(c)
	}
	return characters, nil
}

func (s *service) GetCharacter(ctx context.Context, memberID, id uuid.UUID) (*Character, error) {
	character, err := s.repo.GetByPlayer(ctx, memberID, id)
	if err != nil {
		return nil, fmt.Errorf("get character: %w", err)
	}
	return withSpecialization(character), nil
}

func (s *service) DeleteCharacter(ctx context.Context, memberID, id uuid.UUID) error {
	if err := s.repo.SoftDelete(ctx, memberID, id); err != nil {
		return fmt.Errorf("delete character: %w", err)
	}
	return nil
}

// GrantExperience applies what a run earned a member's character, once per run
// and character. FS-BDA7X §Requirements 25–27.
func (s *service) GrantExperience(ctx context.Context, grant ExperienceGrant) error {
	if grant.SessionID == uuid.Nil || grant.CharacterID == uuid.Nil || grant.MemberID == uuid.Nil {
		return fmt.Errorf("grant experience: session, character and member required: %w", commonconstants.ErrInvalidInput)
	}
	if grant.Amount <= 0 {
		return fmt.Errorf("grant experience: amount %d must be positive: %w", grant.Amount, commonconstants.ErrInvalidInput)
	}

	gain := func(c *Character) {
		c.Exp += grant.Amount
		// the shared table decides; a level is never taken away
		c.Level = max(c.Level, progression.LevelFor(c.Exp))
	}

	if _, err := s.repo.ApplyExperienceGrant(ctx, grant, gain); err != nil {
		return fmt.Errorf("grant experience: %w", err)
	}
	return nil
}

// SpendPassivePoint takes one rank of a passive tree node, deciding the spend
// rule again on what the locked character holds (FS-8RZ51 R13). A target
// already held answers Applied false and writes nothing (R10); a refusal is
// the rule's errcode.Refusal (wrapped; match it with errors.As), with nothing
// written.
func (s *service) SpendPassivePoint(ctx context.Context, spend PassiveSpend) (*PassiveSpendResult, error) {
	if spend.MemberID == uuid.Nil || spend.CharacterID == uuid.Nil || spend.NodeID == "" {
		return nil, fmt.Errorf("spend passive point: member, character and node required: %w", commonconstants.ErrInvalidInput)
	}
	if spend.Rank < 1 {
		return nil, fmt.Errorf("spend passive point: rank %d must be at least 1: %w", spend.Rank, commonconstants.ErrInvalidInput)
	}

	var verdict passivetree.Verdict
	decide := func(c *Character) (bool, error) {
		v, err := passivetree.CheckSpend(c.ClassID, c.Level, c.PassiveRanks, spend.NodeID, spend.Rank)
		var refusal *passivetree.Refusal
		if errors.As(err, &refusal) {
			return false, errcode.Refuse(refusal.Code)
		}
		if err != nil {
			return false, err
		}
		verdict = v
		return v == passivetree.Allowed, nil
	}

	c, err := s.repo.SpendPassivePoint(ctx, spend, decide)
	if err != nil {
		return nil, fmt.Errorf("spend passive point: %w", err)
	}
	return &PassiveSpendResult{Applied: verdict == passivetree.Allowed, Ranks: c.PassiveRanks}, nil
}
