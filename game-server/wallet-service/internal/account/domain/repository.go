package domain

import "github.com/google/uuid"

// PORT
// determine what abstraction is needed for the aggregate of account
// domain to operate correctly
// the repository.go would implement the adapter, acutal concrete
// implementation that satisfies this interface
type Repository interface {
	GetById(id uuid.UUID) (*Account, error)
}
