package game

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/*
	Field loot: a field's drops are derived from the Spire's, never copied
	(FS-X2F2H §D). A kill rolls the Spire row its creature drops as at the
	place's drop factor; a container keeps each item of the Spire's chest roll
	at that factor. A field pile is the killer's for FieldLootWindow, then
	anyone's, and is removed FieldDropPileLifetime after it lands.
*/

// fieldItemPoolLoadTimeout bounds the one catalogue load a field makes as it
// is built.
const fieldItemPoolLoadTimeout = 3 * time.Second

/**
* fieldDrops is a field world's drop consumer, where a run's monsterDrops
* stands: one roll per kill record, against the live Spire row the creature
* drops as, at that row's chance × the place's drop factor, read at roll time
* (FS-X2F2H §Requirements 31, D17, D23). What drops lands in a pile reserved
* for the killer (R33). It runs on the field's tick, like any KillConsumer.
**/
type fieldDrops struct {
	s *Session
	r lootRand // the chance, count and type rolls
}

func newFieldDrops(s *Session, r lootRand) *fieldDrops {
	return &fieldDrops{s: s, r: r}
}

func (f *fieldDrops) ConsumeKill(record systems.KillRecord) {
	place, ok := f.s.FieldPlace()
	if !ok {
		return
	}
	table, ok := fieldDropFor(record)
	if !ok {
		return
	}

	itemIDs := f.s.rollKillDrop(f.r, table, table.Chance*place.DropFactor, record.Level)
	if len(itemIDs) == 0 {
		return
	}

	CreateFieldDropPileEntity(f.s.EntityManager, record.X, record.Y, itemIDs, record.KillerMemberID)
}

// fieldDropFor is the Spire row a field kill rolls, read now: the elite row
// for any elite, else the row of the archetype the creature drops as.
func fieldDropFor(record systems.KillRecord) (MonsterDrop, bool) {
	if record.Elite {
		return EliteMonsterDrop, true
	}
	as, ok := FieldDropsAs[record.Archetype]
	if !ok {
		return MonsterDrop{}, false
	}
	table, ok := MonsterDrops[as]
	return table, ok
}

/**
* fieldContainerRoll is a field container's roll (FS-X2F2H §Requirements 32):
* the Spire's chest roll unchanged (generateItemsAt, its type split included)
* at the item level given, then each rolled item kept with probability factor,
* the place's drop factor. What is not kept leaves the world. It hands back the
* kept items' ids.
**/
func (s *Session) fieldContainerRoll(r lootRand, itemLevel int, factor float64) ([]uuid.UUID, error) {
	rolled, err := s.generateItemsAt(chestDropAt(itemLevel))
	if err != nil {
		return nil, err
	}

	kept, dropped := keepEach(r, rolled, factor)
	for _, id := range dropped {
		s.EntityManager.RemoveEntity(id)
	}
	return kept, nil
}

// keepEach keeps each id with probability factor, one roll per id, in order.
func keepEach(r lootRand, ids []uuid.UUID, factor float64) (kept, dropped []uuid.UUID) {
	for _, id := range ids {
		if r.Float64() < factor {
			kept = append(kept, id)
		} else {
			dropped = append(dropped, id)
		}
	}
	return kept, dropped
}

/**
* ageFieldDropPiles is a field's piles on its tick (FS-X2F2H §Requirements
* 33–34): each ages by deltaTime, its reservation ends once it has lain
* FieldLootWindow, and it is removed with whatever it holds once it has lain
* FieldDropPileLifetime, or at once when emptied. A run's piles are never
* touched. It runs on the tick, unlocked, as the kill consumers do.
**/
func (s *Session) ageFieldDropPiles(deltaTime float64, entities []*ecs.Entity) {
	if s.worldType != types.WorldTypeField {
		return
	}

	for _, entity := range entities {
		cc, ok := entity.GetComponent(ecs.ComponentTypeContainer)
		if !ok {
			continue
		}
		pile, ok := cc.(*components.ContainerComponent)
		if !ok || pile.Kind != components.ContainerKindDropPile {
			continue
		}

		pile.Age += deltaTime
		if pile.Age >= FieldLootWindow {
			pile.ReservedFor = uuid.Nil
		}

		var held []uuid.UUID
		if lc, ok := entity.GetComponent(ecs.ComponentTypeItemIDList); ok {
			held = lc.(*components.ItemIDListComponent).ItemIDs
		}
		if len(held) > 0 && pile.Age < FieldDropPileLifetime {
			continue
		}

		for _, itemID := range held {
			s.EntityManager.RemoveEntity(itemID)
		}
		s.EntityManager.RemoveEntity(entity.ID)
	}
}

// reservedAgainst is whether the container is a pile still reserved for
// someone other than the member. Only a field pile is ever reserved.
// FS-X2F2H §Requirements 33.
func reservedAgainst(container *ecs.Entity, memberID uuid.UUID) bool {
	cc, ok := container.GetComponent(ecs.ComponentTypeContainer)
	if !ok {
		return false
	}
	pile, ok := cc.(*components.ContainerComponent)
	return ok && pile.ReservedFor != uuid.Nil && pile.ReservedFor != memberID
}

/**
* loadFieldItemPool loads a field's item catalogue, once, as it is built and
* before its loop can start: the tick reads itemPool unlocked. A run loads its
* own as its first floor is built (InitialMapObjects). Unavailable, the field
* keeps none and its kills drop nothing, which is logged, never fatal.
**/
func (s *Session) loadFieldItemPool() {
	if s.itemsClient == nil || s.worldType != types.WorldTypeField {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), fieldItemPoolLoadTimeout)
	defer cancel()
	if err := s.InitializeItems(ctx); err != nil {
		slog.Error("Field built without an item pool, its kills drop nothing.", "session_id", s.ID, "error", err)
	}
}
