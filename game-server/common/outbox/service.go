package outbox

import (
	"context"

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
	RelayPendingBatch(ctx context.Context, limit *int, handle BatchHandler) (int, error)
	GetUnpublishedBacklog(ctx context.Context) (Backlog, error)
}

func (s *service) CreateOutbox(ctx context.Context, params OutboxParams) error {
	return s.repo.CreateOutbox(ctx, params)
}

func (s *service) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params OutboxParams) error {
	return s.repo.CreateOutboxTx(ctx, tx, params)
}

func (s *service) RelayPendingBatch(ctx context.Context, limit *int, handle BatchHandler) (int, error) {
	return s.repo.RelayPendingBatch(ctx, limit, handle)
}

func (s *service) GetBacklog(ctx context.Context) (Backlog, error) {
	return s.repo.GetUnpublishedBacklog(ctx)
}
