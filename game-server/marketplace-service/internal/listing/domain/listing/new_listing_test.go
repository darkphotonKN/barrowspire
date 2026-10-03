package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The listing is born with the ID items-service minted when it reserved the
// item, never one of its own (FS-NXP1W Req 24a).
func TestNewListingIsBornWithTheGivenID(t *testing.T) {
	id := uuid.New()
	now := time.Now()

	l, err := NewListing(id, uuid.New(), uuid.New(), 100, now, now.Add(time.Hour))
	require.NoError(t, err)

	assert.Equal(t, id, l.Snapshot().ID)
}

func TestNewListingRefusesNilID(t *testing.T) {
	now := time.Now()

	_, err := NewListing(uuid.Nil, uuid.New(), uuid.New(), 100, now, now.Add(time.Hour))

	assert.ErrorIs(t, err, ErrInvalidUUID)
}
