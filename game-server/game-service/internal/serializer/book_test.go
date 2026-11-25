package serializer

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
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
// with each one's unlock level, whole cost, book cooldown, spent flag and
// cooldown length; the pages not offered are never sent. FS-X2CMM §F R32, §K R59.
func TestFormatStateToClientState_TheOwnersBookInARun(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := uuid.New()
	// a page not offered (one of no resolver: every page of the table is) is
	// never sent, whoever holds it
	pages := append(slices.Clone(warriorPages), components.PageID("unwritten"))
	book := seatBook(seatWithResource(em, warrior, "warrior", stamina(100, 100), components.AttackDash), pages...)

	me := ownFrame(t, em, types.WorldTypeRun, warrior)
	require.Contains(t, me, "book")
	assert.Equal(t, map[string]any{"pages": []any{map[string]any{
		"id": "heave", "unlock_level": float64(3), "cost": float64(25),
		"cooldown": map[string]any{"remaining": float64(0), "total": float64(0)}, "spent": false,
		"cooldown_length": float64(20), "cast_time": float64(2),
	}, map[string]any{
		"id": "hardened", "unlock_level": float64(9), "cost": float64(30),
		"cooldown": map[string]any{"remaining": float64(0), "total": float64(0)}, "spent": false,
		"cooldown_length": float64(90), "cast_time": float64(0),
	}, map[string]any{
		"id": "long_night", "unlock_level": float64(15), "cost": float64(40),
		"cooldown": map[string]any{"remaining": float64(0), "total": float64(0)}, "spent": false,
		"cooldown_length": float64(120), "cast_time": float64(0),
	}}}, me["book"], "ready, {0, 0}, in book order; the unwritten page never sent")

	book.Cooldowns[components.PageHardened] = components.BookCooldown{Remaining: 45, Total: 90}
	me = ownFrame(t, em, types.WorldTypeRun, warrior)
	page := me["book"].(map[string]any)["pages"].([]any)[1].(map[string]any)
	assert.Equal(t, map[string]any{"remaining": float64(45), "total": float64(90)}, page["cooldown"])
}

// A book with no offered page is still a book in a run, its page list empty,
// never null. FS-X2CMM §F R32; Edge States "A mercenary's book in wave 1".
func TestFormatStateToClientState_ABookWithNoOfferedPageIsEmpty(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := uuid.New()
	seatBook(seatMerc(em, merc, 2, components.ParryComponent{}))

	me := ownFrame(t, em, types.WorldTypeRun, merc)
	assert.Equal(t, map[string]any{"pages": []any{}}, me["book"])
}

// The Ledger is written from wave 2: Take a Contract is offered, so a
// mercenary's book is sent with it, costing nothing and unspent.
// FS-X2CMM §F R32, §J R57, §K R59. I-X2CMM-21.
func TestFormatStateToClientState_TheLedgerSendsTakeAContract(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := uuid.New()
	seatBook(seatMerc(em, merc, 2, components.ParryComponent{}),
		components.PagePickTheLock, components.PageStrikeADeal, components.PageTakeAContract)

	me := ownFrame(t, em, types.WorldTypeRun, merc)
	var contract map[string]any
	for _, p := range me["book"].(map[string]any)["pages"].([]any) {
		if page := p.(map[string]any); page["id"] == string(components.PageTakeAContract) {
			contract = page
		}
	}
	require.NotNil(t, contract, "take_a_contract on the book")
	assert.Equal(t, float64(15), contract["unlock_level"])
	assert.Equal(t, float64(0), contract["cost"])
	assert.Equal(t, false, contract["spent"])
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

// FS-X2CMM §D, §F R32, R34. I-X2CMM-2.

var magePages = []components.PageID{components.PageWitchlight, components.PageFarHand}

// While casting, the owner's book carries the page, the time left and the
// whole cast time; absent otherwise. FS-X2CMM §F R32.
func TestFormatStateToClientState_TheOwnersCastInProgress(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := uuid.New()
	book := seatBook(seatWithResource(em, mage, "mage", components.ResourceComponent{Kind: components.ResourceMana, Current: 150, Max: 150}, components.AttackTripleFireball), magePages...)

	assert.NotContains(t, ownFrame(t, em, types.WorldTypeRun, mage)["book"], "casting", "absent while not casting")

	book.Casting = &components.BookCasting{Page: components.PageWitchlight, Elapsed: 0.25, Total: 1}
	got := ownFrame(t, em, types.WorldTypeRun, mage)["book"].(map[string]any)
	assert.Equal(t, map[string]any{"page": "witchlight", "remaining": 0.75, "total": float64(1)}, got["casting"])
}

// Each page carries its cooldown length and, for a limited page, its limit,
// from the class book, so the tip's words come from the server: a timed page
// its seconds and no limit, a once-a-floor page 0 and "floor".
// FS-X2CMM §F R32, "Reconciled at review". I-X2CMM-23.
func TestFormatStateToClientState_EachPageCarriesItsCooldownLengthAndLimit(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := uuid.New()
	seatBook(seatWithResource(em, mage, "mage", mana(150, 150), components.AttackTripleFireball),
		components.PageWitchlight, components.PageRecall)

	pages := ownFrame(t, em, types.WorldTypeRun, mage)["book"].(map[string]any)["pages"].([]any)
	require.Len(t, pages, 2)
	witchlight, recall := pages[0].(map[string]any), pages[1].(map[string]any)
	assert.Equal(t, float64(45), witchlight["cooldown_length"])
	assert.NotContains(t, witchlight, "limit", "a timed page has no limit")
	assert.Equal(t, float64(0), recall["cooldown_length"])
	assert.Equal(t, "floor", recall["limit"])
}

// Each page entry carries its cast time in seconds, 0 for an instant page, so
// the book shows it without a client copy of the table. FS-X2CMM §Change:
// Illuminated pages and the open tome, C5. I-X2CMM-25.
func TestFormatStateToClientState_EachPageCarriesItsCastTime(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := uuid.New()
	seatBook(seatWithResource(em, mage, "mage", mana(150, 150), components.AttackTripleFireball),
		components.PageWitchlight, components.PageRecall)
	warrior := uuid.New()
	seatBook(seatWithResource(em, warrior, "warrior", mana(150, 150), components.AttackDash),
		components.PageHardened)

	pages := ownFrame(t, em, types.WorldTypeRun, mage)["book"].(map[string]any)["pages"].([]any)
	assert.Equal(t, float64(1), pages[0].(map[string]any)["cast_time"])
	assert.Equal(t, float64(3), pages[1].(map[string]any)["cast_time"])
	hardened := ownFrame(t, em, types.WorldTypeRun, warrior)["book"].(map[string]any)["pages"].([]any)[0].(map[string]any)
	assert.Equal(t, float64(0), hardened["cast_time"], "an instant page sends 0")
}

// The wire's limit words: "floor", "delve", absent for a timed page.
// FS-X2CMM "Reconciled at review". I-X2CMM-23.
func TestPageLimitWord(t *testing.T) {
	assert.Equal(t, "floor", pageLimitWord(systems.PageLimitPerFloor))
	assert.Equal(t, "delve", pageLimitWord(systems.PageLimitPerDelve))
	assert.Equal(t, "", pageLimitWord(systems.PageLimitNone))
}

// addBookEffect sets a book effect of the kind down at (x, y).
func addBookEffect(em *ecs.EntityManager, kind components.BookEffectKind, x, y, remaining float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(&components.BookEffectComponent{Kind: kind, Remaining: remaining})
	return e
}

// Every recipient of the run is sent the floor's book effects, as {id, kind,
// x, y, remaining}; none at all leaves the key out. FS-X2CMM §E R21, §F R34.
func TestFormatStateToClientState_BookEffectsForEveryRecipient(t *testing.T) {
	w := newPartyWorld()
	_, before := wireFor(t, w.em, types.WorldTypeRun, w.wren)
	assert.NotContains(t, before, "book_effects", "absent while none stands")

	light := addBookEffect(w.em, components.BookEffectWitchlight, 300, 400, 12.5)
	want := []any{map[string]any{"id": light.ID.String(), "kind": "witchlight", "x": float64(300), "y": float64(400), "remaining": 12.5}}
	for _, recipient := range []uuid.UUID{w.wren, w.mage, w.stranger} {
		_, frame := wireFor(t, w.em, types.WorldTypeRun, recipient)
		assert.Equal(t, want, frame["book_effects"], recipient)
	}
}

// On a dungeon floor a book effect is cut by distance, as a monster is: a
// recipient far from it is not sent it. FS-X2CMM §F R34, FS-KE075 §G.
func TestFormatStateToClientState_BookEffectsAreCutByDistance(t *testing.T) {
	em := ecs.NewEntityManager()
	onFloor(em, 1, 80)
	near, far := uuid.New(), uuid.New()
	addDelver(em, near, 100, 100, 100)
	addDelver(em, far, 100+2*interestRadius, 100, 100)
	addBookEffect(em, components.BookEffectWitchlight, 200, 100, 20)

	_, nearFrame := wireFor(t, em, types.WorldTypeRun, near)
	_, farFrame := wireFor(t, em, types.WorldTypeRun, far)
	assert.Len(t, nearFrame["book_effects"], 1)
	assert.NotContains(t, farFrame, "book_effects")
}

// A rune goes to every recipient as kind "rune", with how many monsters it has
// caught once it has caught any, for the client's flash; a rune that has
// caught none, and every other kind, leaves caught out. FS-X2CMM §E R24, §F
// R34. I-X2CMM-4.
func TestFormatStateToClientState_ARuneCarriesItsCatchCount(t *testing.T) {
	w := newPartyWorld()
	laid := addBookEffect(w.em, components.BookEffectRune, 300, 400, 30)
	ring := &components.RuneComponent{Radius: 60}
	laid.AddComponent(ring)

	_, frame := wireFor(t, w.em, types.WorldTypeRun, w.wren)
	assert.Equal(t, []any{map[string]any{"id": laid.ID.String(), "kind": "rune", "x": float64(300), "y": float64(400), "remaining": float64(30)}}, frame["book_effects"])

	ring.Caught = []uuid.UUID{uuid.New(), uuid.New()}
	for _, recipient := range []uuid.UUID{w.wren, w.mage, w.stranger} {
		_, frame := wireFor(t, w.em, types.WorldTypeRun, recipient)
		effects := frame["book_effects"].([]any)
		require.Len(t, effects, 1, recipient)
		assert.Equal(t, float64(2), effects[0].(map[string]any)["caught"], recipient)
	}
}

// A hound goes to every recipient as kind "hound", with its archer's player
// id, its health and max and what it is doing; at no health it shows dead,
// health 0. No other kind carries those fields. FS-X2CMM §E R28, §F R34.
// I-X2CMM-8.
func TestFormatStateToClientState_AHoundCarriesItsOwnerHealthAndAction(t *testing.T) {
	w := newPartyWorld()
	archer := uuid.New()
	hound := addBookEffect(w.em, components.BookEffectHound, 300, 400, 25)
	hound.AddComponent(components.NewHealthComponent(30, 40))
	hound.AddComponent(&components.HoundComponent{OwnerMemberID: archer, Action: components.HoundActionBite})
	addBookEffect(w.em, components.BookEffectWitchlight, 310, 400, 5)

	want := map[string]any{
		"id": hound.ID.String(), "kind": "hound", "x": float64(300), "y": float64(400), "remaining": float64(25),
		"owner_id": archer.String(), "health": float64(30), "max_health": float64(40), "action": "bite",
	}
	for _, recipient := range []uuid.UUID{w.wren, w.mage, w.stranger} {
		_, frame := wireFor(t, w.em, types.WorldTypeRun, recipient)
		effects := frame["book_effects"].([]any)
		require.Len(t, effects, 2, recipient)
		assert.Contains(t, effects, want, recipient)
		for _, e := range effects {
			if e.(map[string]any)["kind"] == "witchlight" {
				assert.NotContains(t, e, "owner_id")
				assert.NotContains(t, e, "health")
				assert.NotContains(t, e, "action")
			}
		}
	}

	hc, _ := hound.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	_, frame := wireFor(t, w.em, types.WorldTypeRun, w.wren)
	for _, e := range frame["book_effects"].([]any) {
		if e.(map[string]any)["kind"] == "hound" {
			assert.Equal(t, "dead", e.(map[string]any)["action"])
			assert.Equal(t, float64(0), e.(map[string]any)["health"])
		}
	}
}

// A book effect whose time is up is taken from the world on the tick, and the
// tick's state, cut from the tick's own entities, does not send it again with
// no time left; a draught, which has no time of its own, is sent. FS-X2CMM
// §E R21, R27–R28, §F R34. I-X2CMM-22.
func TestFormatStateToClientState_ABookEffectWhoseTimeIsUpIsNotSent(t *testing.T) {
	w := newPartyWorld()
	addBookEffect(w.em, components.BookEffectHound, 300, 400, 0)
	addBookEffect(w.em, components.BookEffectWitchlight, 310, 400, -0.01)
	draught := addBookEffect(w.em, components.BookEffectDraught, 320, 400, 0)

	_, frame := wireFor(t, w.em, types.WorldTypeRun, w.wren)

	effects := frame["book_effects"].([]any)
	require.Len(t, effects, 1)
	assert.Equal(t, draught.ID.String(), effects[0].(map[string]any)["id"])
}

// A rune taken on its third catch is still among the tick's entities, and the
// tick's state does not send it once more. FS-X2CMM §E R24, §F R34. I-X2CMM-23.
func TestFormatStateToClientState_ARuneWithItsThreeCatchesIsNotSent(t *testing.T) {
	w := newPartyWorld()
	laid := addBookEffect(w.em, components.BookEffectRune, 300, 400, 12)
	laid.AddComponent(&components.RuneComponent{Radius: 60, Caught: []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}})

	_, frame := wireFor(t, w.em, types.WorldTypeRun, w.wren)

	assert.Empty(t, frame["book_effects"])
}
