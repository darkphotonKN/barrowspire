package character

import (
	"context"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *repository {
	return &repository{db: db}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// (unique violation -> ErrDuplicateResource, no rows -> ErrNotFound) and wraps
// anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("character repo", op, err)
}

const characterColumns = `id, player_id, class_id, name, level, exp, created_at, updated_at, deleted_at`

// Create inserts a live character; level, experience and timestamps take the
// column defaults (level 1, 0 XP). A live name taken in any case is
// ErrDuplicateResource (idx_characters_name on lower(name)).
func (r *repository) Create(ctx context.Context, c *Character) (*Character, error) {
	query := `
		INSERT INTO characters (id, player_id, class_id, name)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + characterColumns

	var created Character
	if err := r.db.QueryRowxContext(ctx, query, c.ID, c.PlayerID, c.ClassID, c.Name).StructScan(&created); err != nil {
		return nil, wrapDBErr("create character", err)
	}
	return &created, nil
}

// ListByPlayer returns the member's live characters, oldest first.
func (r *repository) ListByPlayer(ctx context.Context, playerID uuid.UUID) ([]*Character, error) {
	query := `
		SELECT ` + characterColumns + `
		FROM characters
		WHERE player_id = $1 AND deleted_at IS NULL
		ORDER BY created_at, id`

	characters := []*Character{}
	if err := r.db.SelectContext(ctx, &characters, query, playerID); err != nil {
		return nil, wrapDBErr("list characters by player", err)
	}
	return characters, nil
}

// GetByPlayer reads one of the member's live characters. Another member's, a
// deleted, and an unknown character are all ErrNotFound.
func (r *repository) GetByPlayer(ctx context.Context, playerID, id uuid.UUID) (*Character, error) {
	query := `
		SELECT ` + characterColumns + `
		FROM characters
		WHERE id = $1 AND player_id = $2 AND deleted_at IS NULL`

	var c Character
	if err := r.db.GetContext(ctx, &c, query, id, playerID); err != nil {
		return nil, wrapDBErr("get character by player", err)
	}
	return &c, nil
}

// SoftDelete marks one of the member's live characters deleted. Another
// member's, an already-deleted, and an unknown character are all ErrNotFound.
func (r *repository) SoftDelete(ctx context.Context, playerID, id uuid.UUID) error {
	query := `
		UPDATE characters
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND player_id = $2 AND deleted_at IS NULL`

	res, err := r.db.ExecContext(ctx, query, id, playerID)
	if err != nil {
		return wrapDBErr("soft delete character", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return wrapDBErr("soft delete character rows affected", err)
	}
	if n == 0 {
		return fmt.Errorf("soft delete character %s: %w", id, commonconstants.ErrNotFound)
	}
	return nil
}

// ApplyExperienceGrant records the grant and applies it to the member's live
// character in one transaction. The character row is locked first, so grants
// for one character serialise; then the grant is recorded under its
// (session_id, character_id) key, and only a newly recorded grant runs apply
// and writes the character's level and experience back.
//
// A character that is not the member's live one is ErrNotFound and a grant
// already recorded is ErrAlreadyProcessed; neither records or changes anything.
func (r *repository) ApplyExperienceGrant(ctx context.Context, grant ExperienceGrant, apply func(*Character)) (*Character, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, wrapDBErr("begin experience grant", err)
	}
	// a no-op once committed
	defer func() { _ = tx.Rollback() }()

	var c Character
	lockQuery := `
		SELECT ` + characterColumns + `
		FROM characters
		WHERE id = $1 AND player_id = $2 AND deleted_at IS NULL
		FOR UPDATE`
	if err := tx.GetContext(ctx, &c, lockQuery, grant.CharacterID, grant.MemberID); err != nil {
		return nil, wrapDBErr("lock character for experience grant", err)
	}

	recordQuery := `
		INSERT INTO experience_grants (session_id, character_id, amount)
		VALUES ($1, $2, $3)
		ON CONFLICT (session_id, character_id) DO NOTHING`
	res, err := tx.ExecContext(ctx, recordQuery, grant.SessionID, grant.CharacterID, grant.Amount)
	if err != nil {
		return nil, wrapDBErr("record experience grant", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return nil, wrapDBErr("record experience grant rows affected", err)
	}
	if n == 0 {
		return nil, fmt.Errorf("experience grant %s/%s: %w", grant.SessionID, grant.CharacterID, commonconstants.ErrAlreadyProcessed)
	}

	apply(&c)

	updateQuery := `
		UPDATE characters
		SET level = $2, exp = $3, updated_at = NOW()
		WHERE id = $1
		RETURNING ` + characterColumns
	var updated Character
	if err := tx.QueryRowxContext(ctx, updateQuery, c.ID, c.Level, c.Exp).StructScan(&updated); err != nil {
		return nil, wrapDBErr("apply experience grant", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, wrapDBErr("commit experience grant", err)
	}
	return &updated, nil
}
