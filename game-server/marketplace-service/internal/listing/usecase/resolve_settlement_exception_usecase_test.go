package usecase

import (
	"context"
	"errors"
	"testing"

	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubExceptionResolver struct {
	err   error
	gotID uuid.UUID
}

func (s *stubExceptionResolver) Resolve(ctx context.Context, id uuid.UUID) error {
	s.gotID = id
	return s.err
}

func TestResolveSettlementExceptionUC(t *testing.T) {
	dbDown := errors.New("connection refused")

	tests := []struct {
		name    string
		repoErr error
		wantErr error
	}{
		// the repo folds "just resolved" and "already resolved" into nil
		{name: "resolved or already resolved is success"},
		{name: "a missing exception stays recognisable as not found", repoErr: commonerr.ErrNotFound, wantErr: commonerr.ErrNotFound},
		{name: "infrastructure failure passes through", repoErr: dbDown, wantErr: dbDown},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubExceptionResolver{err: tt.repoErr}
			id := uuid.New()

			err := NewResolveSettlementExceptionUC(repo).Handle(context.Background(), ResolveSettlementExceptionCommand{ExceptionID: id})

			assert.Equal(t, id, repo.gotID)
			if tt.wantErr == nil {
				require.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}
