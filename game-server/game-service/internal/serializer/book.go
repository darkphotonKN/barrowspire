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
// everyone is sent. A run's book effects (witchlights, runes, the hound) are
// world effects beside the players, not here. FS-X2CMM §F R32–R34.
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
	return &types.BookState{Pages: pages}
}

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
