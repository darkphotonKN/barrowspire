package character

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

// maxNameLength matches characters.name VARCHAR(32), counted in characters.
const maxNameLength = 32

// classes is the closed set a character may be (FS-BDA7X R3).
var classes = map[string]bool{"warrior": true, "mage": true, "archer": true}

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

	created, err := s.repo.Create(ctx, &Character{
		ID:       uuid.New(),
		PlayerID: in.MemberID,
		ClassID:  in.Class,
		Name:     name,
	})
	if err != nil {
		return nil, fmt.Errorf("create character: %w", err)
	}
	return created, nil
}

func (s *service) ListCharacters(ctx context.Context, memberID uuid.UUID) ([]*Character, error) {
	characters, err := s.repo.ListByPlayer(ctx, memberID)
	if err != nil {
		return nil, fmt.Errorf("list characters: %w", err)
	}
	return characters, nil
}

func (s *service) GetCharacter(ctx context.Context, memberID, id uuid.UUID) (*Character, error) {
	character, err := s.repo.GetByPlayer(ctx, memberID, id)
	if err != nil {
		return nil, fmt.Errorf("get character: %w", err)
	}
	return character, nil
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
