package character

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// The database backstop for a one-word name: migration 000003's CHECK holds
// for any writer that skips CreateCharacter (FS-KCQ06 §Requirements 19). Same
// opt-in as repository_test.go: CHARACTER_TEST_DSN, a migrated character DB.

const nameCheck = "characters_name_one_word"

// checkViolation is Postgres's SQLSTATE for a row a CHECK refuses.
const checkViolation = "23514"

func isCheckViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == checkViolation && pqErr.Constraint == nameCheck
}

// nameCheckValidated reports whether the CHECK is on characters, and whether
// it was validated against every row (false for NOT VALID).
func nameCheckValidated(t *testing.T, db *sqlx.DB) (present, validated bool) {
	t.Helper()
	err := db.Get(&validated, `
		SELECT convalidated FROM pg_constraint
		WHERE conrelid = 'characters'::regclass AND conname = $1 AND contype = 'c'`, nameCheck)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false
	}
	if err != nil {
		t.Fatalf("read constraint: %v", err)
	}
	return true, validated
}

func TestNameCheck_IsAValidatedCheckAndNoTrigger(t *testing.T) {
	repo, _ := testRepo(t)

	present, validated := nameCheckValidated(t, repo.db)
	if !present || !validated {
		t.Fatalf("%s present %v validated %v, want a validated CHECK", nameCheck, present, validated)
	}

	var triggers int
	if err := repo.db.Get(&triggers, `
		SELECT count(*) FROM pg_trigger
		WHERE tgrelid = 'characters'::regclass AND NOT tgisinternal`); err != nil {
		t.Fatalf("count triggers: %v", err)
	}
	if triggers != 0 {
		t.Fatalf("characters has %d triggers, want none", triggers)
	}
}

func TestNameCheck_WhitespaceName_RefusedOnInsertAndUpdate(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	word, err := repo.Create(ctx, newCharacter(member, uniqueName("word")))
	if err != nil {
		t.Fatalf("create one-word character: %v", err)
	}

	tests := []struct {
		name string
		gap  string
	}{
		{"space", " "},
		{"tab", "\t"},
		{"ideographic space", "　"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name := "Dark" + tt.gap + uuid.NewString()[:8]

			_, err := repo.db.ExecContext(ctx,
				`INSERT INTO characters (player_id, class_id, name) VALUES ($1, 'warrior', $2)`, member, name)
			if !isCheckViolation(err) {
				t.Errorf("insert err = %v, want a %s check violation", err, nameCheck)
			}

			_, err = repo.db.ExecContext(ctx, `UPDATE characters SET name = $1 WHERE id = $2`, name, word.ID)
			if !isCheckViolation(err) {
				t.Errorf("update err = %v, want a %s check violation", err, nameCheck)
			}
		})
	}
}

// A one-word character is untouched by the CHECK: an experience grant
// (UPDATE level, exp) and a soft delete still go through.
func TestNameCheck_OneWordCharacter_GrantAndDeleteSucceed(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c, err := repo.Create(ctx, newCharacter(member, uniqueName("word")))
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	grant := ExperienceGrant{SessionID: uuid.New(), CharacterID: c.ID, MemberID: member, Amount: 50}
	got, err := repo.ApplyExperienceGrant(ctx, grant, func(c *Character) { c.Exp += 50; c.Level = 2 })
	if err != nil || got.Exp != 50 || got.Level != 2 {
		t.Fatalf("grant = %v, %v, want exp 50 level 2", got, err)
	}

	if err := repo.SoftDelete(ctx, member, c.ID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}
}

// 000003 down drops the CHECK and up adds it back, validated. The DB is left
// where it started: at the latest migration. (A full down past 000001 is not
// round-trippable: 000001's down drops a table named examples, not characters.)
func TestNameCheckMigration_UpDownUp(t *testing.T) {
	repo, _ := testRepo(t)
	m, err := migrate.New("file://../../migrations", os.Getenv("CHARACTER_TEST_DSN"))
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { _, _ = m.Close() })

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		t.Fatalf("up: %v", err)
	}
	latest, _, err := m.Version()
	if err != nil || latest < 3 {
		t.Fatalf("version = %d, %v, want 3 or later", latest, err)
	}

	// down to 000002 takes 000003 (and anything after it) off
	if err := m.Migrate(2); err != nil {
		t.Fatalf("down to 000002: %v", err)
	}
	if present, _ := nameCheckValidated(t, repo.db); present {
		t.Fatalf("%s still present after down", nameCheck)
	}

	if err := m.Migrate(latest); err != nil {
		t.Fatalf("up to %d again: %v", latest, err)
	}
	if present, validated := nameCheckValidated(t, repo.db); !present || !validated {
		t.Fatalf("after up again present %v validated %v, want a validated CHECK", present, validated)
	}
}
