package serializer

import (
	"slices"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// setBook puts the delver's class book on their state: the book itself on the
// owner's part, in a run only, and the timed book states on the public part
// everyone is sent. A run's book effects (witchlights, runes, draughts, hounds) are
// book effects beside the players (bookEffectState), not here. FS-X2CMM §F R32–R34.
func setBook(state *types.PlayerState, entity *ecs.Entity, worldType types.WorldType) {
	bc, ok := entity.GetComponent(ecs.ComponentTypeBook)
	if !ok {
		return
	}
	book := bc.(*components.BookComponent)

	state.BookStates = bookStates(book)
	if worldType == types.WorldTypeRun {
		state.Book = bookState(book)
	}
}

// bookState is the owner's book: its offered pages in book order, locked ones
// included; never nil pages, so an empty book reads as [].
func bookState(book *components.BookComponent) *types.BookState {
	pages := make([]types.BookPageState, 0, len(book.Pages))
	for _, id := range book.Pages {
		page, ok := systems.BookPageOf(string(id))
		if !ok || !systems.PageOffered(id) {
			continue
		}
		cooldown := book.Cooldowns[id]
		pages = append(pages, types.BookPageState{
			ID:          string(id),
			UnlockLevel: page.UnlockLevel,
			Cost:        page.Cost,
			Cooldown:    types.CooldownState{Remaining: cooldown.Remaining, Total: cooldown.Total},
			Spent:       book.Spent[id],
		})
	}
	return &types.BookState{Pages: pages, Casting: castingState(book.Casting)}
}

// castingState is a cast in progress as its caster is told it, nil when none.
func castingState(casting *components.BookCasting) *types.BookCastingState {
	if casting == nil {
		return nil
	}
	return &types.BookCastingState{
		Page:      string(casting.Page),
		Remaining: max(casting.Total-casting.Elapsed, 0),
		Total:     casting.Total,
	}
}

// bookEffectState is a book effect as every recipient of the run is told it;
// false for anything else, an effect with no place, or one whose time is up
// (gone from the world this tick, though still among its entities).
func bookEffectState(entity *ecs.Entity) (*types.BookEffectState, bool) {
	ec, ok := entity.GetComponent(ecs.ComponentTypeBookEffect)
	if !ok || systems.BookEffectExpired(entity) {
		return nil, false
	}
	tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return nil, false
	}
	effect, at := ec.(*components.BookEffectComponent), tc.(*components.TransformComponent)
	state := &types.BookEffectState{
		ID:        entity.ID,
		Kind:      string(effect.Kind),
		X:         at.X,
		Y:         at.Y,
		Remaining: effect.Remaining,
		Caught:    caughtOn(entity),
	}
	setHound(state, entity)
	return state, true
}

// setHound puts a hound's own fields on its state: its archer, its health and
// max, and what it is doing, dead at no health whatever it last did. Anything
// else is left as it is. FS-X2CMM §E R28, §F R34.
func setHound(state *types.BookEffectState, entity *ecs.Entity) {
	hound, ok := systems.HoundOf(entity)
	if !ok {
		return
	}
	owner := hound.OwnerMemberID
	state.OwnerID = &owner
	state.Action = string(hound.Action)
	if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
		health := hc.(*components.HealthComponent)
		current := health.CurrentHealth
		state.Health, state.MaxHealth = &current, health.MaxHealth
		if current <= 0 {
			state.Action = string(components.HoundActionDead)
		}
	}
}

// caughtOn is how many monsters the book effect has caught: a rune's count,
// 0 for anything else.
func caughtOn(entity *ecs.Entity) int {
	rc, ok := entity.GetComponent(ecs.ComponentTypeRune)
	if !ok {
		return 0
	}
	return len(rc.(*components.RuneComponent).Caught)
}

func bookEffectAt(e *types.BookEffectState) types.Position { return types.Position{X: e.X, Y: e.Y} }

// bookStates are the delver's timed book states by name, nil when none.
func bookStates(book *components.BookComponent) []types.BookTimedState {
	if len(book.States) == 0 {
		return nil
	}
	states := make([]types.BookTimedState, 0, len(book.States))
	for name, left := range book.States {
		states = append(states, types.BookTimedState{Name: string(name), Remaining: left})
	}
	slices.SortFunc(states, func(a, b types.BookTimedState) int { return strings.Compare(a.Name, b.Name) })
	return states
}
