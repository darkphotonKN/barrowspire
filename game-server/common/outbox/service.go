package outbox

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type service struct {
	repo Repository
}

func NewService(repo Repository) *service {
	return &service{
		repo: repo,
	}
}

type Repository interface {
	CreateOutbox(ctx context.Context, params OutboxParams) error
	CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params OutboxParams) error
	GetUnpublishedOutboxItems(ctx context.Context, limit *int) ([]*OutboxEvent, error)
	UpdateOutboxToPublished(ctx context.Context, id uuid.UUID) error
	GetUnpublishedBacklog(ctx context.Context) (Backlog, error)
}

func (s *service) CreateOutbox(ctx context.Context, params OutboxParams) error {
	return s.repo.CreateOutbox(ctx, params)
}

func (s *service) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params OutboxParams) error {
	return s.repo.CreateOutboxTx(ctx, tx, params)
}

func (s *service) UpdateOutboxToPublished(ctx context.Context, id uuid.UUID) error {
	return s.repo.UpdateOutboxToPublished(ctx, id)
}

func (s *service) GetPendingOutboxItems(ctx context.Context, limit *int) ([]*OutboxEvent, error) {
	return s.repo.GetUnpublishedOutboxItems(ctx, limit)
}

func (s *service) GetBacklog(ctx context.Context) (Backlog, error) {
	return s.repo.GetUnpublishedBacklog(ctx)
}
