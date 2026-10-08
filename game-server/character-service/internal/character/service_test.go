package character

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
)

// fakeRepo records what the service hands it and returns canned results. The
// SQL-level rules (member scoping, case-insensitive uniqueness) are proven
// against Postgres in repository_test.go.
type fakeRepo struct {
	created   *Character
	createErr error

	listed    uuid.UUID
	list      []*Character
	got       [2]uuid.UUID
	get       *Character
	getErr    error
	deleted   [2]uuid.UUID
	deleteErr error

	grants   map[[2]uuid.UUID]bool
	grantErr error
}

func (f *fakeRepo) Create(ctx context.Context, c *Character) (*Character, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	f.created = c
	out := *c
	out.Level, out.Exp = 1, 0
	return &out, nil
}

func (f *fakeRepo) ListByPlayer(ctx context.Context, playerID uuid.UUID) ([]*Character, error) {
	f.listed = playerID
	return f.list, nil
}

func (f *fakeRepo) GetByPlayer(ctx context.Context, playerID, id uuid.UUID) (*Character, error) {
	f.got = [2]uuid.UUID{playerID, id}
	return f.get, f.getErr
}

// ApplyExperienceGrant keeps one character and the grants recorded against it,
// so a replay is seen the way the grant table's key sees it.
func (f *fakeRepo) ApplyExperienceGrant(ctx context.Context, grant ExperienceGrant, apply func(*Character)) (*Character, error) {
	if f.grantErr != nil {
		return nil, f.grantErr
	}
	c := f.get
	if c == nil || c.ID != grant.CharacterID || c.PlayerID != grant.MemberID || c.DeletedAt != nil {
		return nil, commonconstants.ErrNotFound
	}
	key := [2]uuid.UUID{grant.SessionID, grant.CharacterID}
	if f.grants[key] {
		return nil, commonconstants.ErrAlreadyProcessed
	}
	if f.grants == nil {
		f.grants = map[[2]uuid.UUID]bool{}
	}
	f.grants[key] = true
	apply(c)
	out := *c
	return &out, nil
}

func (f *fakeRepo) SoftDelete(ctx context.Context, playerID, id uuid.UUID) error {
	f.deleted = [2]uuid.UUID{playerID, id}
	return f.deleteErr
}

func TestCreateCharacter_Validation(t *testing.T) {
	member := uuid.New()
	tests := []struct {
		name     string
		in       CharacterCreate
		wantErr  error
		wantName string
	}{
		{"valid warrior", CharacterCreate{member, "Aldric", "warrior"}, nil, "Aldric"},
		{"valid mage", CharacterCreate{member, "Mira", "mage"}, nil, "Mira"},
		{"valid archer", CharacterCreate{member, "Fen", "archer"}, nil, "Fen"},
		{"name is trimmed", CharacterCreate{member, "  Aldric \t", "warrior"}, nil, "Aldric"},
		{"name of exactly 32", CharacterCreate{member, strings.Repeat("a", 32), "mage"}, nil, strings.Repeat("a", 32)},
		{"32 multibyte runes", CharacterCreate{member, strings.Repeat("é", 32), "mage"}, nil, strings.Repeat("é", 32)},
		{"unknown class", CharacterCreate{member, "Aldric", "paladin"}, commonconstants.ErrInvalidInput, ""},
		{"class is case-sensitive", CharacterCreate{member, "Aldric", "Warrior"}, commonconstants.ErrInvalidInput, ""},
		{"empty class", CharacterCreate{member, "Aldric", ""}, commonconstants.ErrInvalidInput, ""},
		{"empty name", CharacterCreate{member, "", "warrior"}, commonconstants.ErrInvalidInput, ""},
		{"blank name", CharacterCreate{member, "   ", "warrior"}, commonconstants.ErrInvalidInput, ""},
		{"name over 32", CharacterCreate{member, strings.Repeat("a", 33), "warrior"}, commonconstants.ErrInvalidInput, ""},
		{"no member", CharacterCreate{uuid.Nil, "Aldric", "warrior"}, commonconstants.ErrInvalidInput, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{}
			svc := NewService(repo, nil)

			got, err := svc.CreateCharacter(context.Background(), tt.in)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if repo.created != nil {
					t.Fatalf("repo was written despite invalid input")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if repo.created.PlayerID != member || repo.created.ClassID != tt.in.Class || repo.created.Name != tt.wantName {
				t.Fatalf("stored %+v, want member %s class %s name %q", repo.created, member, tt.in.Class, tt.wantName)
			}
			if got.Level != 1 || got.Exp != 0 {
				t.Fatalf("got level %d exp %d, want 1/0", got.Level, got.Exp)
			}
		})
	}
}

func TestCreateCharacter_TakenName_IsAlreadyExists(t *testing.T) {
	svc := NewService(&fakeRepo{createErr: commonconstants.ErrDuplicateResource}, nil)

	_, err := svc.CreateCharacter(context.Background(), CharacterCreate{uuid.New(), "Aldric", "warrior"})

	if !errors.Is(err, commonconstants.ErrDuplicateResource) {
		t.Fatalf("err = %v, want ErrDuplicateResource", err)
	}
}

func TestListCharacters_ScopedToMember(t *testing.T) {
	member := uuid.New()
	repo := &fakeRepo{list: []*Character{{Name: "a"}, {Name: "b"}}}
	svc := NewService(repo, nil)

	got, err := svc.ListCharacters(context.Background(), member)

	if err != nil || len(got) != 2 || repo.listed != member {
		t.Fatalf("got %v, %v (listed for %s), want 2 characters for %s", got, err, repo.listed, member)
	}
}

func TestGetAndDeleteCharacter_ScopedToMember(t *testing.T) {
	member, id := uuid.New(), uuid.New()
	repo := &fakeRepo{get: &Character{ID: id}}
	svc := NewService(repo, nil)

	if _, err := svc.GetCharacter(context.Background(), member, id); err != nil {
		t.Fatalf("get: %v", err)
	}
	if err := svc.DeleteCharacter(context.Background(), member, id); err != nil {
		t.Fatalf("delete: %v", err)
	}
	want := [2]uuid.UUID{member, id}
	if repo.got != want || repo.deleted != want {
		t.Fatalf("scoped get %v delete %v, want %v", repo.got, repo.deleted, want)
	}
}

func TestGetAndDeleteCharacter_NotFound_PassesThrough(t *testing.T) {
	repo := &fakeRepo{getErr: commonconstants.ErrNotFound, deleteErr: commonconstants.ErrNotFound}
	svc := NewService(repo, nil)

	if _, err := svc.GetCharacter(context.Background(), uuid.New(), uuid.New()); !errors.Is(err, commonconstants.ErrNotFound) {
		t.Fatalf("get err = %v, want ErrNotFound", err)
	}
	if err := svc.DeleteCharacter(context.Background(), uuid.New(), uuid.New()); !errors.Is(err, commonconstants.ErrNotFound) {
		t.Fatalf("delete err = %v, want ErrNotFound", err)
	}
}

// A grant adds its experience and the level follows the shared table; the
// same run's grant applied again changes nothing. FS-BDA7X §Requirements 25–26.
func TestGrantExperience_AppliedOnce(t *testing.T) {
	member, session := uuid.New(), uuid.New()
	c := &Character{ID: uuid.New(), PlayerID: member, Level: 1}
	svc := NewService(&fakeRepo{get: c}, nil)
	grant := ExperienceGrant{SessionID: session, CharacterID: c.ID, MemberID: member, Amount: 120}

	if err := svc.GrantExperience(context.Background(), grant); err != nil {
		t.Fatalf("first grant: %v", err)
	}
	err := svc.GrantExperience(context.Background(), grant)

	if !errors.Is(err, commonconstants.ErrAlreadyProcessed) {
		t.Fatalf("replay err = %v, want ErrAlreadyProcessed", err)
	}
	if c.Exp != 120 || c.Level != 2 {
		t.Fatalf("after replay exp %d level %d, want 120 / 2", c.Exp, c.Level)
	}
}

// Levels follow total experience, may cross several at once, stop at the cap,
// and never drop below the stored level. FS-BDA7X §Requirements 15–16, 25.
func TestGrantExperience_LevelFollowsTheTable(t *testing.T) {
	tests := []struct {
		name        string
		level       int32
		exp, amount int64
		wantLevel   int32
		wantExp     int64
	}{
		{"below a threshold", 1, 0, 99, 1, 99},
		{"several levels at once", 1, 0, 600, 5, 600},
		{"at the cap experience accumulates", 20, 40000, 500, 20, 40500},
		{"never below the stored level", 6, 10, 10, 6, 20},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			member := uuid.New()
			c := &Character{ID: uuid.New(), PlayerID: member, Level: tt.level, Exp: tt.exp}
			svc := NewService(&fakeRepo{get: c}, nil)

			err := svc.GrantExperience(context.Background(), ExperienceGrant{SessionID: uuid.New(), CharacterID: c.ID, MemberID: member, Amount: tt.amount})

			if err != nil {
				t.Fatalf("grant: %v", err)
			}
			if c.Level != tt.wantLevel || c.Exp != tt.wantExp {
				t.Fatalf("level %d exp %d, want %d / %d", c.Level, c.Exp, tt.wantLevel, tt.wantExp)
			}
		})
	}
}

// A grant with no run, character or member, or nothing to add, is not one.
func TestGrantExperience_Invalid(t *testing.T) {
	valid := ExperienceGrant{SessionID: uuid.New(), CharacterID: uuid.New(), MemberID: uuid.New(), Amount: 10}
	tests := []struct {
		name string
		edit func(g *ExperienceGrant)
	}{
		{"no run", func(g *ExperienceGrant) { g.SessionID = uuid.Nil }},
		{"no character", func(g *ExperienceGrant) { g.CharacterID = uuid.Nil }},
		{"no member", func(g *ExperienceGrant) { g.MemberID = uuid.Nil }},
		{"nothing to add", func(g *ExperienceGrant) { g.Amount = 0 }},
		{"negative", func(g *ExperienceGrant) { g.Amount = -5 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			grant := valid
			tt.edit(&grant)

			err := NewService(&fakeRepo{}, nil).GrantExperience(context.Background(), grant)

			if !errors.Is(err, commonconstants.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

// Another member's, a deleted and an unknown character all pass through as
// not found, for the consumer to drop. FS-BDA7X §Requirements 27.
func TestGrantExperience_NotTheMembersLiveCharacter_NotFound(t *testing.T) {
	member := uuid.New()
	deletedAt := time.Now()
	live := &Character{ID: uuid.New(), PlayerID: member, Level: 1}
	dead := &Character{ID: uuid.New(), PlayerID: member, Level: 1, DeletedAt: &deletedAt}
	tests := []struct {
		name   string
		stored *Character
		grant  ExperienceGrant
	}{
		{"another member's", live, ExperienceGrant{SessionID: uuid.New(), CharacterID: live.ID, MemberID: uuid.New(), Amount: 10}},
		{"deleted", dead, ExperienceGrant{SessionID: uuid.New(), CharacterID: dead.ID, MemberID: member, Amount: 10}},
		{"unknown", live, ExperienceGrant{SessionID: uuid.New(), CharacterID: uuid.New(), MemberID: member, Amount: 10}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := NewService(&fakeRepo{get: tt.stored}, nil).GrantExperience(context.Background(), tt.grant)

			if !errors.Is(err, commonconstants.ErrNotFound) {
				t.Fatalf("err = %v, want ErrNotFound", err)
			}
			if tt.stored.Exp != 0 {
				t.Fatalf("character changed: exp %d", tt.stored.Exp)
			}
		})
	}
}
