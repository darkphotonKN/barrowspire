package character

import (
	"context"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
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
	// a new character holds no ranks
	created.PassiveRanks = passivetree.Ranks{}
	return &created, nil
}

// ListByPlayer returns the member's live characters, oldest first, each with
// its held passive ranks. The ranks of every listed character are one query.
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
	if len(characters) == 0 {
		return characters, nil
	}

	ranksQuery := `
		SELECT pr.character_id, pr.node_id, pr.rank
		FROM passive_ranks pr
		JOIN characters c ON c.id = pr.character_id
		WHERE c.player_id = $1 AND c.deleted_at IS NULL`
	rows := []passiveRank{}
	if err := r.db.SelectContext(ctx, &rows, ranksQuery, playerID); err != nil {
		return nil, wrapDBErr("list passive ranks by player", err)
	}
	byCharacter := make(map[uuid.UUID]passivetree.Ranks, len(characters))
	for _, c := range characters {
		c.PassiveRanks = passivetree.Ranks{}
		byCharacter[c.ID] = c.PassiveRanks
	}
	for _, row := range rows {
		// a character created between the two reads is not listed; skip its rows
		if ranks, ok := byCharacter[row.CharacterID]; ok {
			ranks[row.NodeID] = row.Rank
		}
	}
	return characters, nil
}

// GetByPlayer reads one of the member's live characters with its held passive
// ranks. Another member's, a deleted, and an unknown character are all
// ErrNotFound.
func (r *repository) GetByPlayer(ctx context.Context, playerID, id uuid.UUID) (*Character, error) {
	query := `
		SELECT ` + characterColumns + `
		FROM characters
		WHERE id = $1 AND player_id = $2 AND deleted_at IS NULL`

	var c Character
	if err := r.db.GetContext(ctx, &c, query, id, playerID); err != nil {
		return nil, wrapDBErr("get character by player", err)
	}
	ranks, err := passiveRanksOf(ctx, r.db, c.ID)
	if err != nil {
		return nil, err
	}
	c.PassiveRanks = ranks
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

// SpendPassivePoint decides and writes one passive spend in one transaction.
// The member's live character row is locked first, so spends of one character
// serialise (FS-8RZ51 R13); its ranks are read after the lock, so decide sees
// every spend committed before it. Only when decide answers true is the
// spend's rank written. decide's error comes back as is, and the transaction
// rolls back with nothing written.
func (r *repository) SpendPassivePoint(ctx context.Context, spend PassiveSpend, decide func(*Character) (bool, error)) (*Character, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, wrapDBErr("begin passive spend", err)
	}
	// a no-op once committed
	defer func() { _ = tx.Rollback() }()

	var c Character
	lockQuery := `
		SELECT ` + characterColumns + `
		FROM characters
		WHERE id = $1 AND player_id = $2 AND deleted_at IS NULL
		FOR UPDATE`
	if err := tx.GetContext(ctx, &c, lockQuery, spend.CharacterID, spend.MemberID); err != nil {
		return nil, wrapDBErr("lock character for passive spend", err)
	}
	ranks, err := passiveRanksOf(ctx, tx, c.ID)
	if err != nil {
		return nil, err
	}
	c.PassiveRanks = ranks

	write, err := decide(&c)
	if err != nil {
		return nil, err
	}
	if !write {
		return &c, nil
	}

	upsertQuery := `
		INSERT INTO passive_ranks (character_id, node_id, rank)
		VALUES ($1, $2, $3)
		ON CONFLICT (character_id, node_id) DO UPDATE
		SET rank = EXCLUDED.rank, updated_at = NOW()`
	if _, err := tx.ExecContext(ctx, upsertQuery, c.ID, spend.NodeID, spend.Rank); err != nil {
		return nil, wrapDBErr("write passive rank", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, wrapDBErr("commit passive spend", err)
	}
	c.PassiveRanks[spend.NodeID] = spend.Rank
	return &c, nil
}

// passiveRank is one passive_ranks row.
type passiveRank struct {
	CharacterID uuid.UUID `db:"character_id"`
	NodeID      string    `db:"node_id"`
	Rank        int       `db:"rank"`
}

// passiveRanksOf reads one character's held ranks; none is an empty Ranks.
func passiveRanksOf(ctx context.Context, q sqlx.QueryerContext, characterID uuid.UUID) (passivetree.Ranks, error) {
	query := `
		SELECT character_id, node_id, rank
		FROM passive_ranks
		WHERE character_id = $1`
	rows := []passiveRank{}
	if err := sqlx.SelectContext(ctx, q, &rows, query, characterID); err != nil {
		return nil, wrapDBErr("read passive ranks", err)
	}
	ranks := passivetree.Ranks{}
	for _, row := range rows {
		ranks[row.NodeID] = row.Rank
	}
	return ranks, nil
}
