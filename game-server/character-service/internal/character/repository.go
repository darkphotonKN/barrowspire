package character

import (
	"database/sql"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) Repository {
	return &repository{db: db}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("character repo", op, err)
}

func (r *repository) CreateCharacter(character *Character) (*Character, error) {
	now := time.Now()
	characterModel := &Character{
		ID:        uuid.New().String(),
		Name:      character.Name,
		CreatedAt: now,
		UpdatedAt: now,
	}

	query := `
		INSERT INTO characters (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, created_at, updated_at
	`

	err := r.db.QueryRowx(
		query,
		characterModel.ID,
		characterModel.Name,
		characterModel.ClassID,
		characterModel.CreatedAt,
		characterModel.UpdatedAt,
	).StructScan(characterModel)

	if err != nil {
		return nil, wrapDBErr("db create character", err)
	}

	return characterModel, nil
}

func (r *repository) GetByID(id uuid.UUID) (*Character, error) {
	var character Character
	err := r.db.Get(&character, "SELECT * FROM characters WHERE id = $1", id)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, wrapDBErr("get character by id", err)
	}

	return &character, nil
}
