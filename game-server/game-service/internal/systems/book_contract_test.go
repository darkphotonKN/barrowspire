package systems

import (
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R11, §J R57; FS-4EC7Z §E R16. I-X2CMM-21.

// contractDesk is a world's contract entry point as a test stands it in: it
// records who took a contract and refuses with refuse when set.
type contractDesk struct {
	takers []uuid.UUID
	refuse error
}

func (d *contractDesk) TakeContract(taker uuid.UUID) error {
	if d.refuse != nil {
		return d.refuse
	}
	d.takers = append(d.takers, taker)
	return nil
}

// contractCast is a level-15 mercenary's Take a Contract, the world's entry
// point desk.
func contractCast(t *testing.T, desk ContractTaker) (BookCast, *ecs.Entity) {
	t.Helper()
	em := ecs.NewEntityManager()
	merc := bookDelver(em, "mercenary", 15, 100, 100, components.PageTakeAContract)
	page, ok := BookPageOf(string(components.PageTakeAContract))
	require.True(t, ok)
	return BookCast{Caster: merc, Page: page, CellSize: testCell, BookGround: BookGround{Contracts: desk}}, merc
}

// A mercenary's Take a Contract places the delve's contract through the
// world's entry point, for the caster as a member, on the tick it is taken;
// it costs nothing and is spent for the delve. R57, R11.
func TestBookSystemCast_TakeAContract_TakesTheContractForTheCaster(t *testing.T) {
	desk := &contractDesk{}
	cast, merc := contractCast(t, desk)
	pool, _ := bookPool(merc)
	before := pool.Current

	require.NoError(t, NewBookSystem(ecs.NewEntityManager()).Cast(cast))

	assert.Equal(t, []uuid.UUID{memberIDOf(merc)}, desk.takers)
	assert.True(t, bookOfT(t, merc).Spent[components.PageTakeAContract], "once per delve")
	assert.Equal(t, before, pool.Current, "no cost")
}

// The entry point's refusal refuses the cast with that reason and nothing
// spent: the once-a-delve use stays for a later cast. A world with no entry
// point takes no contract. FS-4EC7Z §E R16, FS-X2CMM §A R4.
func TestBookSystemCast_TakeAContract_RefusedByTheWorldNothingSpent(t *testing.T) {
	refusal := errors.New("a contract was already taken this delve")
	for name, desk := range map[string]ContractTaker{"refused": &contractDesk{refuse: refusal}, "no entry point": nil} {
		t.Run(name, func(t *testing.T) {
			cast, merc := contractCast(t, desk)

			err := NewBookSystem(ecs.NewEntityManager()).Cast(cast)

			if desk != nil {
				assert.ErrorIs(t, err, refusal)
			} else {
				assert.ErrorIs(t, err, ErrNoContracts)
			}
			assert.False(t, bookOfT(t, merc).Spent[components.PageTakeAContract], "the use unspent")
		})
	}
}
