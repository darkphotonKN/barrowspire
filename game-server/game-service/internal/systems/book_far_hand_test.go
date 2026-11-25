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

// FS-X2CMM §B R9, §C R13-R14, §D R17, §J R50 as reconciled at wave 2.
// I-X2CMM-15.

// farHandDesk is the world's far reach as a test stands it in: it records
// what was worked and for whom, and refuses with refuse when set.
type farHandDesk struct {
	workers []uuid.UUID
	worked  []uuid.UUID
	refuse  error
}

func (d *farHandDesk) ReachFar(worker uuid.UUID, target *ecs.Entity) error {
	if d.refuse != nil {
		return d.refuse
	}
	d.workers = append(d.workers, worker)
	d.worked = append(d.worked, target.ID)
	return nil
}

// farHandMage is a level-5 mage at (0, 0) with Far Hand, in world em.
func farHandMage(em *ecs.EntityManager) *ecs.Entity {
	return bookDelver(em, "mage", 5, 0, 0, components.PageFarHand)
}

// farHandCast is mage's Far Hand at target, reaching through desk.
func farHandCast(t *testing.T, mage, target *ecs.Entity, desk FarReach) BookCast {
	t.Helper()
	page, ok := BookPageOf(string(components.PageFarHand))
	require.True(t, ok)
	return BookCast{Caster: mage, Page: page, Target: target, CellSize: testCell, PageEntryPoints: PageEntryPoints{FarReach: desk}}
}

// castFarHandThrough casts Far Hand and counts its 1 s cast to its end with
// the world's far reach desk.
func castFarHandThrough(t *testing.T, em *ecs.EntityManager, cast BookCast) error {
	t.Helper()
	books := NewBookSystem(em)
	if err := books.Cast(cast); err != nil {
		return err
	}
	for range ticksOf(1) {
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)
	}
	return nil
}

// standing places a new entity at (x, y) with the components given.
func standing(em *ecs.EntityManager, x, y float64, parts ...ecs.Component) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	for _, p := range parts {
		e.AddComponent(p)
	}
	return e
}

func sealPiece(kind components.SealPieceKind) *components.SealPieceComponent {
	return &components.SealPieceComponent{Kind: kind}
}

func interactable() ecs.Component { return components.NewInteractableComponent(60) }

// detectedArmedTrap is a detected, armed trap of kind on the cell holding
// (x, y).
func detectedArmedTrap(em *ecs.EntityManager, kind components.TrapKind, x, y float64) *ecs.Entity {
	return standing(em, x, y, &components.TrapComponent{Kind: kind, Armed: true}, &components.DetectableComponent{Detected: true})
}

// What Far Hand works, 5 cells off: an up lever, an up bridge lever, a shut
// chest or sack, a floor door, shut or open, and a detected, armed trap of
// every kind. The cast completes after 1 s: the world's far reach works the
// target for the mage, 25 mana is paid and the 30 s cooldown starts.
func TestBookSystemCast_FarHand_WorksEachTargetItTakes(t *testing.T) {
	at := 5 * testCell
	tests := map[string]func(em *ecs.EntityManager) *ecs.Entity{
		"a lever": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, sealPiece(components.SealPieceLever), interactable())
		},
		"a bridge lever": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, sealPiece(components.SealPieceBridgeLever), interactable())
		},
		"a shut chest": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, components.NewContainerComponent(uuid.New()), components.NewOpenableComponent(false), interactable())
		},
		"a shut sack": func(em *ecs.EntityManager) *ecs.Entity {
			sack := components.NewContainerComponent(uuid.New())
			sack.Kind = components.ContainerKindSack
			return standing(em, at, 0, sack, components.NewOpenableComponent(false), interactable())
		},
		"a shut door": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, components.NewDoorComponent(80, 16), components.NewOpenableComponent(false))
		},
		"an open door": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, components.NewDoorComponent(80, 16), components.NewOpenableComponent(true))
		},
	}
	for _, kind := range components.TrapKinds {
		tests["a detected "+string(kind)] = func(em *ecs.EntityManager) *ecs.Entity { return detectedArmedTrap(em, kind, at, 0) }
	}
	for name, place := range tests {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := farHandMage(em)
			target := place(em)
			desk := &farHandDesk{}
			pool, _ := bookPool(mage)
			before := pool.Current

			require.NoError(t, castFarHandThrough(t, em, farHandCast(t, mage, target, desk)))

			assert.Equal(t, []uuid.UUID{target.ID}, desk.worked)
			assert.Equal(t, []uuid.UUID{memberIDOf(mage)}, desk.workers, "worked for the mage, as a member")
			assert.Equal(t, before-25, pool.Current, "25 mana")
			assert.Equal(t, components.BookCooldown{Remaining: 30, Total: 30}, bookOfT(t, mage).Cooldowns[components.PageFarHand])
		})
	}
}

// What Far Hand refuses, each at the cast with nothing spent and nothing
// worked: a plate (held by weight, no interact), a stone block, a brazier, a
// stair key, a lever already down, a bridge already lowered, an open chest,
// stairs, the escape door, an altar, a tome, the hallowed altar, a merchant,
// a barrier (the gate, a secret door), a cage, an encounter NPC, a mural, an
// undetected trap and a trap not armed. Each is an interactable to the
// world, so only Far Hand's own rule keeps them out.
func TestBookSystemCast_FarHand_RefusesEveryOtherTarget(t *testing.T) {
	at := 5 * testCell
	piece := func(kind components.SealPieceKind, active bool) func(em *ecs.EntityManager) *ecs.Entity {
		return func(em *ecs.EntityManager) *ecs.Entity {
			p := sealPiece(kind)
			p.Active = active
			return standing(em, at, 0, p, interactable())
		}
	}
	marked := func(c ecs.Component) func(em *ecs.EntityManager) *ecs.Entity {
		return func(em *ecs.EntityManager) *ecs.Entity { return standing(em, at, 0, c, interactable()) }
	}
	barrier := func(kind components.BarrierKind) func(em *ecs.EntityManager) *ecs.Entity {
		return func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, &components.BarrierComponent{Kind: kind}, components.NewDoorComponent(80, 80),
				components.NewOpenableComponent(false), &components.DetectableComponent{Detected: true})
		}
	}
	tests := map[string]func(em *ecs.EntityManager) *ecs.Entity{
		"a plate": piece(components.SealPiecePlate, false),
		"a stone block": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, sealPiece(components.SealPieceBlock), &components.StoneBlockComponent{}, interactable())
		},
		"a brazier":            piece(components.SealPieceBrazier, false),
		"a stair key":          piece(components.SealPieceStairKey, false),
		"a lever already down": piece(components.SealPieceLever, true),
		"a lowered bridge":     piece(components.SealPieceBridgeLever, true),
		"an open chest": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, components.NewContainerComponent(uuid.New()), components.NewOpenableComponent(true), interactable())
		},
		"the stairs":         marked(&components.StairsComponent{}),
		"the escape door":    marked(&components.EscapeDoorComponent{}),
		"an altar":           marked(&components.AltarComponent{}),
		"a tome":             marked(&components.TomeComponent{}),
		"the hallowed altar": marked(&components.HallowedAltarComponent{}),
		"a merchant":         marked(&components.MerchantComponent{}),
		"a cage":             marked(&components.CageComponent{}),
		"an encounter NPC":   marked(&components.EncounterNPCComponent{}),
		"a mural":            marked(&components.LorePieceComponent{Kind: components.LoreMural}),
		"the gate":           barrier(components.BarrierGate),
		"a secret door":      barrier(components.BarrierSecretDoor),
		"an undetected trap": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, &components.TrapComponent{Kind: components.TrapSpikePlate, Armed: true}, &components.DetectableComponent{})
		},
		"a trap re-arming": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, &components.TrapComponent{Kind: components.TrapSpikePlate, RearmIn: 4}, &components.DetectableComponent{Detected: true})
		},
		"a spent tripwire": func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, at, 0, &components.TrapComponent{Kind: components.TrapTripwire, Spent: true}, &components.DetectableComponent{Detected: true})
		},
	}
	for name, place := range tests {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := farHandMage(em)
			desk := &farHandDesk{}
			pool, _ := bookPool(mage)
			before := pool.Current

			err := castFarHandThrough(t, em, farHandCast(t, mage, place(em), desk))

			assert.ErrorIs(t, err, ErrBadPageTarget)
			assert.Empty(t, desk.worked)
			assert.Nil(t, bookOfT(t, mage).Casting, "no cast started")
			assert.Equal(t, before, pool.Current)
			assert.Empty(t, bookOfT(t, mage).Cooldowns)
		})
	}
}

// Far Hand's range is 6 cells from the mage's centre to the target's: a
// lever 6 cells off is taken, one past 6 is refused. A door is measured to
// its doorway's middle, as an interact's reach is, so a door whose top-left
// corner is in range but whose middle is not is refused. R14.
func TestBookSystemCast_FarHand_SixCellsToTheTargetsMiddle(t *testing.T) {
	tests := []struct {
		name  string
		place func(em *ecs.EntityManager) *ecs.Entity
		want  error
	}{
		{"a lever 6 cells off", func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, 6*testCell, 0, sealPiece(components.SealPieceLever), interactable())
		}, nil},
		{"a lever past 6 cells", func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, 6*testCell+1, 0, sealPiece(components.SealPieceLever), interactable())
		}, ErrBadPageTarget},
		{"a door whose middle is 6 cells off", func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, 6*testCell-40, -8, components.NewDoorComponent(80, 16), components.NewOpenableComponent(false))
		}, nil},
		{"a door whose corner is in range and its middle not", func(em *ecs.EntityManager) *ecs.Entity {
			return standing(em, 6*testCell-20, -8, components.NewDoorComponent(80, 16), components.NewOpenableComponent(false))
		}, ErrBadPageTarget},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := farHandMage(em)

			err := NewBookSystem(em).Cast(farHandCast(t, mage, tt.place(em), &farHandDesk{}))

			if tt.want == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tt.want)
			}
		})
	}
}

// The target is judged again when the cast completes (R17): gone from the
// world, pulled down by a teammate meanwhile, a chest opened meanwhile, or a
// trap that fired under someone meanwhile, the cast ends with nothing worked
// and nothing spent.
func TestBookSystemCast_FarHand_ReJudgedAtCompletion(t *testing.T) {
	at := 5 * testCell
	tests := map[string]struct {
		place  func(em *ecs.EntityManager) *ecs.Entity
		change func(em *ecs.EntityManager, target *ecs.Entity)
	}{
		"the lever gone": {
			func(em *ecs.EntityManager) *ecs.Entity {
				return standing(em, at, 0, sealPiece(components.SealPieceLever), interactable())
			},
			func(em *ecs.EntityManager, target *ecs.Entity) { em.RemoveEntity(target.ID) },
		},
		"the lever pulled down": {
			func(em *ecs.EntityManager) *ecs.Entity {
				return standing(em, at, 0, sealPiece(components.SealPieceLever), interactable())
			},
			func(_ *ecs.EntityManager, target *ecs.Entity) {
				pc, _ := target.GetComponent(ecs.ComponentTypeSealPiece)
				pc.(*components.SealPieceComponent).Active = true
			},
		},
		"the chest opened": {
			func(em *ecs.EntityManager) *ecs.Entity {
				return standing(em, at, 0, components.NewContainerComponent(uuid.New()), components.NewOpenableComponent(false), interactable())
			},
			func(_ *ecs.EntityManager, target *ecs.Entity) {
				oc, _ := target.GetComponent(ecs.ComponentTypeOpenable)
				oc.(*components.OpenableComponent).IsOpen = true
			},
		},
		"the trap fired": {
			func(em *ecs.EntityManager) *ecs.Entity { return detectedArmedTrap(em, components.TrapDartWall, at, 0) },
			func(_ *ecs.EntityManager, target *ecs.Entity) {
				tc, _ := target.GetComponent(ecs.ComponentTypeTrap)
				tc.(*components.TrapComponent).Armed = false
			},
		},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := farHandMage(em)
			target := tt.place(em)
			desk := &farHandDesk{}
			cast := farHandCast(t, mage, target, desk)
			books := NewBookSystem(em)
			pool, _ := bookPool(mage)
			before := pool.Current
			require.NoError(t, books.Cast(cast))

			tt.change(em, target)
			for range ticksOf(1) {
				books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)
			}

			assert.Empty(t, desk.worked)
			assert.Nil(t, bookOfT(t, mage).Casting)
			assert.Equal(t, before, pool.Current)
			assert.Empty(t, bookOfT(t, mage).Cooldowns)
		})
	}
}

// The world's refusal at the end of the cast (a guarded chest) ends it with
// nothing spent; a world with no far reach works nothing. The refusal is the
// cast's, as an entry point's is.
func TestBookSystemCast_FarHand_RefusedByTheWorldNothingSpent(t *testing.T) {
	guarded := errors.New("its guards still stand")
	for name, desk := range map[string]FarReach{"refused": &farHandDesk{refuse: guarded}, "no far reach": nil} {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := farHandMage(em)
			chest := standing(em, 3*testCell, 0, components.NewContainerComponent(uuid.New()), components.NewOpenableComponent(false), interactable())
			cast := farHandCast(t, mage, chest, desk)
			pool, _ := bookPool(mage)
			before := pool.Current
			// an instant cast takes the entry point's refusal back whole
			cast.Page.CastTime = 0

			err := NewBookSystem(em).Cast(cast)

			if desk != nil {
				assert.ErrorIs(t, err, guarded)
			} else {
				assert.ErrorIs(t, err, ErrNoFarReach)
			}
			assert.Equal(t, before, pool.Current)
			assert.Empty(t, bookOfT(t, mage).Cooldowns)
		})
	}
}

// Far Hand is offered: castable and sent. §K R59.
func TestPageOffered_FarHand(t *testing.T) {
	assert.True(t, PageOffered(components.PageFarHand))
}
