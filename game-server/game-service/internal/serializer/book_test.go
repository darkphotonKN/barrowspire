package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §F R32–R34, §K R59. I-X2CMM-1.

// seatBook gives the delver their class's book, as a seat does.
func seatBook(delver *ecs.Entity, pages ...components.PageID) *components.BookComponent {
	book := components.NewBookComponent(pages)
	delver.AddComponent(book)
	return book
}

var warriorPages = []components.PageID{components.PageHeave, components.PageHardened, components.PageLongNight}

// In a run the owner is told the offered pages of their book, in book order,
// with each one's unlock level, whole cost, book cooldown and spent flag; the
// pages not offered are never sent. FS-X2CMM §F R32, §K R59.
func TestFormatStateToClientState_TheOwnersBookInARun(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := uuid.New()
	book := seatBook(seatWithResource(em, warrior, "warrior", stamina(100, 100), components.AttackDash), warriorPages...)

	me := ownFrame(t, em, types.WorldTypeRun, warrior)
	require.Contains(t, me, "book")
	assert.Equal(t, map[string]any{"pages": []any{map[string]any{
		"id": "hardened", "unlock_level": float64(9), "cost": float64(30),
		"cooldown": map[string]any{"remaining": float64(0), "total": float64(0)}, "spent": false,
	}}}, me["book"], "ready, {0, 0}")

	book.Cooldowns[components.PageHardened] = components.BookCooldown{Remaining: 45, Total: 90}
	me = ownFrame(t, em, types.WorldTypeRun, warrior)
	page := me["book"].(map[string]any)["pages"].([]any)[0].(map[string]any)
	assert.Equal(t, map[string]any{"remaining": float64(45), "total": float64(90)}, page["cooldown"])
}

// A class with no offered page still has a book in a run, its page list
// empty, never null. FS-X2CMM §F R32; Edge States "A mercenary's book in wave 1".
func TestFormatStateToClientState_ABookWithNoOfferedPageIsEmpty(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := uuid.New()
	seatBook(seatMerc(em, merc, 2, components.ParryComponent{}),
		components.PagePickTheLock, components.PageStrikeADeal, components.PageTakeAContract)

	me := ownFrame(t, em, types.WorldTypeRun, merc)
	assert.Equal(t, map[string]any{"pages": []any{}}, me["book"])
}

// The book is absent in the hub and the fields. FS-X2CMM §F R32.
func TestFormatStateToClientState_NoBookOutsideARun(t *testing.T) {
	for _, world := range []types.WorldType{types.WorldTypeHub, types.WorldTypeField} {
		t.Run(string(world), func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := uuid.New()
			seatBook(seatWithResource(em, warrior, "warrior", stamina(100, 100), components.AttackDash), warriorPages...)

			assert.NotContains(t, ownFrame(t, em, world, warrior), "book")
		})
	}
}

// Another player's book is never sent, party or not; their book states are.
// FS-X2CMM §F R33–R34.
func TestFormatStateToClientState_BookStatesOnEveryoneTheBookOnTheOwnerOnly(t *testing.T) {
	w := newPartyWorld()
	mate, _ := w.em.GetEntity(entityOf(t, w, w.wren))
	seatBook(mate, warriorPages...).States[components.BookStateHardened] = 7.5
	for _, id := range []uuid.UUID{w.mage, w.stranger} {
		body, _ := w.em.GetEntity(entityOf(t, w, id))
		seatBook(body)
	}
	hardened := []any{map[string]any{"name": "hardened", "remaining": 7.5}}

	for _, recipient := range []uuid.UUID{w.mage, w.stranger} {
		other := w.frameFor(t, types.WorldTypeRun, recipient)[w.wren]
		require.NotNil(t, other)
		assert.NotContains(t, other, "book")
		assert.Equal(t, hardened, other["book_states"])
	}

	me := ownFrame(t, w.em, types.WorldTypeRun, w.wren)
	assert.Equal(t, hardened, me["book_states"])
	assert.NotContains(t, ownFrame(t, w.em, types.WorldTypeRun, w.mage), "book_states", "none while no state runs")
}

// entityOf is the body of a member in the party world.
func entityOf(t *testing.T, w *partyWorld, memberID uuid.UUID) uuid.UUID {
	t.Helper()
	for _, e := range w.em.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypePlayer); ok && pc.(*components.PlayerComponent).MemberID == memberID {
			return e.ID
		}
	}
	t.Fatalf("no body for %s", memberID)
	return uuid.Nil
}
