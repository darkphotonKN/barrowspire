package example

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
	return commonhelpers.WrapDBErr("example repo", op, err)
}

func (r *repository) Create(example *ExampleCreate) (*Example, error) {
	now := time.Now()
	exampleModel := &Example{
		ID:        uuid.New().String(),
		Name:      example.Name,
		CreatedAt: now,
		UpdatedAt: now,
	}

	query := `
		INSERT INTO examples (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, created_at, updated_at
	`

	err := r.db.QueryRowx(
		query,
		exampleModel.ID,
		exampleModel.Name,
		exampleModel.CreatedAt,
		exampleModel.UpdatedAt,
	).StructScan(exampleModel)

	if err != nil {
		return nil, wrapDBErr("create example", err)
	}

	return exampleModel, nil
}

func (r *repository) GetByID(id uuid.UUID) (*Example, error) {
	var example Example
	err := r.db.Get(&example, "SELECT * FROM examples WHERE id = $1", id)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, wrapDBErr("get example by id", err)
	}

	return &example, nil
}
