package usecase

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ResolveSettlementExceptionUC closes the exception a parked step raised, once
// that step has succeeded (FS-NXP1W Req 10.3). Already resolved is success.
type ResolveSettlementExceptionUC struct {
	repo SettlementExceptionResolver
}

type SettlementExceptionResolver interface {
	Resolve(ctx context.Context, id uuid.UUID) error
}

func NewResolveSettlementExceptionUC(repo SettlementExceptionResolver) *ResolveSettlementExceptionUC {
	return &ResolveSettlementExceptionUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type ResolveSettlementExceptionCommand struct {
	ExceptionID uuid.UUID
}

func (uc *ResolveSettlementExceptionUC) Handle(ctx context.Context, cmd ResolveSettlementExceptionCommand) error {
	if err := uc.repo.Resolve(ctx, cmd.ExceptionID); err != nil {
		return fmt.Errorf("resolve settlement exception usecase handle exception id %v: %w", cmd.ExceptionID, err)
	}

	return nil
}
