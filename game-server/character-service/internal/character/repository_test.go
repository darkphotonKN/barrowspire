package character

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// Opt-in: runs only with CHARACTER_TEST_DSN pointing at a migrated character
// DB. Rows are committed (the repo runs on the pool) and removed on cleanup by
// the test's own member ids.
func testRepo(t *testing.T) (*repository, func(members ...uuid.UUID)) {
	t.Helper()
	dsn := os.Getenv("CHARACTER_TEST_DSN")
	if dsn == "" {
		t.Skip("CHARACTER_TEST_DSN not set")
	}
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	cleanup := func(members ...uuid.UUID) {
		t.Cleanup(func() {
			for _, m := range members {
				if _, err := db.Exec(`DELETE FROM characters WHERE player_id = $1`, m); err != nil {
					t.Errorf("cleanup: %v", err)
				}
			}
		})
	}
	return NewRepository(db), cleanup
}

func newCharacter(member uuid.UUID, name string) *Character {
	return &Character{ID: uuid.New(), PlayerID: member, ClassID: "warrior", Name: name}
}

// uniqueName keeps runs independent: idx_characters_name is global across members.
func uniqueName(prefix string) string {
	return prefix + uuid.NewString()[:8]
}

func TestRepositoryCreate_StoresMemberClassNameWithDefaults(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)

	created, err := repo.Create(ctx, &Character{ID: uuid.New(), PlayerID: member, ClassID: "mage", Name: uniqueName("mira")})

	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.PlayerID != member || created.ClassID != "mage" || created.Level != 1 || created.Exp != 0 || created.DeletedAt != nil {
		t.Fatalf("created %+v", created)
	}
}

func TestRepositoryList_OnlyThatMembersLiveCharactersOldestFirst(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	a, b := uuid.New(), uuid.New()
	cleanup(a, b)

	first, err := repo.Create(ctx, newCharacter(a, uniqueName("first")))
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := repo.Create(ctx, newCharacter(a, uniqueName("second")))
	if err != nil {
		t.Fatalf("create second: %v", err)
	}
	gone, err := repo.Create(ctx, newCharacter(a, uniqueName("gone")))
	if err != nil {
		t.Fatalf("create gone: %v", err)
	}
	if err := repo.SoftDelete(ctx, a, gone.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	listA, err := repo.ListByPlayer(ctx, a)
	if err != nil {
		t.Fatalf("list a: %v", err)
	}
	if len(listA) != 2 || listA[0].ID != first.ID || listA[1].ID != second.ID {
		t.Fatalf("list a = %+v, want [first, second]", listA)
	}

	listB, err := repo.ListByPlayer(ctx, b)
	if err != nil || len(listB) != 0 {
		t.Fatalf("list b = %v, %v, want empty", listB, err)
	}
}

func TestRepositoryGetAndDelete_ForeignDeletedUnknown_NotFound(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	owner, other := uuid.New(), uuid.New()
	cleanup(owner, other)

	live, err := repo.Create(ctx, newCharacter(owner, uniqueName("live")))
	if err != nil {
		t.Fatalf("create live: %v", err)
	}
	deleted, err := repo.Create(ctx, newCharacter(owner, uniqueName("dead")))
	if err != nil {
		t.Fatalf("create deleted: %v", err)
	}
	if err := repo.SoftDelete(ctx, owner, deleted.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if got, err := repo.GetByPlayer(ctx, owner, live.ID); err != nil || got.ID != live.ID {
		t.Fatalf("owner get = %v, %v", got, err)
	}

	tests := []struct {
		name   string
		member uuid.UUID
		id     uuid.UUID
	}{
		{"another member's", other, live.ID},
		{"deleted", owner, deleted.ID},
		{"unknown", owner, uuid.New()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := repo.GetByPlayer(ctx, tt.member, tt.id); !errors.Is(err, commonconstants.ErrNotFound) {
				t.Errorf("get err = %v, want ErrNotFound", err)
			}
			if err := repo.SoftDelete(ctx, tt.member, tt.id); !errors.Is(err, commonconstants.ErrNotFound) {
				t.Errorf("delete err = %v, want ErrNotFound", err)
			}
		})
	}

	// the foreign delete above must not have touched the owner's character
	if _, err := repo.GetByPlayer(ctx, owner, live.ID); err != nil {
		t.Fatalf("owner's character after foreign delete: %v", err)
	}
}

func TestRepositoryCreate_NameTakenInAnyCase_Duplicate(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	a, b := uuid.New(), uuid.New()
	cleanup(a, b)
	name := uniqueName("Aldric")

	if _, err := repo.Create(ctx, newCharacter(a, name)); err != nil {
		t.Fatalf("create: %v", err)
	}
	_, err := repo.Create(ctx, &Character{ID: uuid.New(), PlayerID: b, ClassID: "archer", Name: strings.ToLower(name)})
	if !errors.Is(err, commonconstants.ErrDuplicateResource) {
		t.Fatalf("err = %v, want ErrDuplicateResource", err)
	}
}

func TestRepositoryCreate_NameFreedByDelete_CanBeReused(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	name := uniqueName("reuse")

	first, err := repo.Create(ctx, newCharacter(member, name))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.SoftDelete(ctx, member, first.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := repo.Create(ctx, newCharacter(member, name)); err != nil {
		t.Fatalf("recreate after delete: %v", err)
	}
}

// A grant adds its experience and recomputes the level in one transaction;
// the same (session, character) applied again changes nothing. FS-BDA7X
// §Requirements 25–26.
func TestRepositoryApplyExperienceGrant_AppliedOnce(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c, err := repo.Create(ctx, newCharacter(member, uniqueName("grant")))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	grant := ExperienceGrant{SessionID: uuid.New(), CharacterID: c.ID, MemberID: member, Amount: 120}
	apply := func(c *Character) { c.Exp += 120; c.Level = 2 }

	got, err := repo.ApplyExperienceGrant(ctx, grant, apply)
	if err != nil {
		t.Fatalf("first grant: %v", err)
	}
	if got.Exp != 120 || got.Level != 2 {
		t.Fatalf("after grant exp %d level %d", got.Exp, got.Level)
	}

	if _, err := repo.ApplyExperienceGrant(ctx, grant, apply); !errors.Is(err, commonconstants.ErrAlreadyProcessed) {
		t.Fatalf("replay err = %v, want ErrAlreadyProcessed", err)
	}
	stored, err := repo.GetByPlayer(ctx, member, c.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if stored.Exp != 120 || stored.Level != 2 {
		t.Fatalf("after replay exp %d level %d, want 120 / 2", stored.Exp, stored.Level)
	}

	// another run's grant is a fresh delta
	next := grant
	next.SessionID = uuid.New()
	if got, err := repo.ApplyExperienceGrant(ctx, next, func(c *Character) { c.Exp += 120 }); err != nil || got.Exp != 240 {
		t.Fatalf("second run = %v, %v", got, err)
	}
}

// A grant for another member's, a deleted or an unknown character records
// nothing and changes nothing. FS-BDA7X §Requirements 27.
func TestRepositoryApplyExperienceGrant_NotTheMembersLiveCharacter_NotFound(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	owner, other := uuid.New(), uuid.New()
	cleanup(owner, other)
	live, err := repo.Create(ctx, newCharacter(owner, uniqueName("live")))
	if err != nil {
		t.Fatalf("create live: %v", err)
	}
	deleted, err := repo.Create(ctx, newCharacter(owner, uniqueName("dead")))
	if err != nil {
		t.Fatalf("create deleted: %v", err)
	}
	if err := repo.SoftDelete(ctx, owner, deleted.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	tests := []struct {
		name   string
		member uuid.UUID
		id     uuid.UUID
	}{
		{"another member's", other, live.ID},
		{"deleted", owner, deleted.ID},
		{"unknown", owner, uuid.New()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			grant := ExperienceGrant{SessionID: uuid.New(), CharacterID: tt.id, MemberID: tt.member, Amount: 50}
			applied := false

			_, err := repo.ApplyExperienceGrant(ctx, grant, func(c *Character) { applied = true; c.Exp += 50 })

			if !errors.Is(err, commonconstants.ErrNotFound) {
				t.Fatalf("err = %v, want ErrNotFound", err)
			}
			if applied {
				t.Fatal("the grant was applied")
			}
		})
	}

	if stored, err := repo.GetByPlayer(ctx, owner, live.ID); err != nil || stored.Exp != 0 {
		t.Fatalf("owner's character after foreign grant = %v, %v", stored, err)
	}
}
