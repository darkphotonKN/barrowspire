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

	l, err := NewListing(id, uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)

	assert.Equal(t, id, l.Snapshot().ID)
}

func TestNewListingRefusesNilID(t *testing.T) {
	now := time.Now()

	_, err := NewListing(uuid.Nil, uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))

	assert.ErrorIs(t, err, ErrInvalidUUID)
}

// A buyout price is optional, and when set it must sit strictly above the
// start price: a buyout equal to the opening bid is just a bid (FS-9XKS6 Req 2).
func TestNewListing_BuyoutPrice(t *testing.T) {
	ptr := func(v int) *int { return &v }

	tests := []struct {
		name    string
		buyout  *int
		wantErr error
	}{
		{"none", nil, nil},
		{"above start price", ptr(101), nil},
		{"equal to start price", ptr(100), ErrInvalidBuyoutPrice},
		{"below start price", ptr(50), ErrInvalidBuyoutPrice},
		{"zero", ptr(0), ErrInvalidBuyoutPrice},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()

			l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, tt.buyout, now, now.Add(time.Hour))

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.buyout, l.Snapshot().BuyoutPrice)
		})
	}
}

// The snapshot must not hand back a pointer into the aggregate.
func TestListingSnapshot_BuyoutPriceIsACopy(t *testing.T) {
	now := time.Now()
	buyout := 500

	l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)

	*l.Snapshot().BuyoutPrice = 1

	assert.Equal(t, 500, *l.Snapshot().BuyoutPrice)
}

func TestReconstitute_CarriesBuyoutPrice(t *testing.T) {
	buyout := 500

	l, err := Reconstitute(ReconstituteParams{ID: uuid.New(), StartPrice: 100, BuyoutPrice: &buyout, Status: StatusActive})
	require.NoError(t, err)

	assert.Equal(t, 500, *l.Snapshot().BuyoutPrice)
}
