package serializer

import (
	"context"
	"math"
	"sync"

	"github.com/darkphotonKN/barrowspire-server/common/progression"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The state serializer struct is in charge of serializing all complex game
* state in the form of entity and components into client consumable state.
**/
type StateSerializer struct {
	em               *ecs.EntityManager
	parties          PartyMembership
	backendStatePool *sync.Pool
}

// PartyMembership is the pod's party membership as last published: which
// party each player is in, player id → party id. The map handed back is never
// written by anyone, so a world's goroutine may read it while the hub's loop
// publishes the next one; nil means no one is in a party. FS-CH21F §Requirements 5–6.
type PartyMembership interface {
	Snapshot() map[uuid.UUID]uuid.UUID
}

// NewStateSerializer builds a world's serializer. parties tells it who is in
// whose party, so a recipient's teammates carry their resource; nil, no one is.
func NewStateSerializer(em *ecs.EntityManager, parties PartyMembership) *StateSerializer {
	return &StateSerializer{em: em, parties: parties, backendStatePool: &sync.Pool{
		New: func() interface{} {
			return &types.BackendGameState{
				Players:    make(map[uuid.UUID]*types.PlayerState),
				LeftBehind: make(map[uuid.UUID]*types.PlayerState),
				Escaped:    make(map[uuid.UUID]*types.PlayerState),
				Resources:  make(map[uuid.UUID]*types.ResourceState),
				Parries:    make(map[uuid.UUID]*types.ParryState),
				TimedOpens: make(map[uuid.UUID]*types.TimedOpenState),
				InPlay:     make(map[uuid.UUID]types.Position),
				Items:      make([]uuid.UUID, 0),
				Doors:      make([]*types.DoorState, 0),
				Walls:      make([]*types.WallState, 0),
				Containers: make([]*types.ContainerState, 0),
				EscapeDoor: make([]*types.EscapeDoorState, 0),
				Switch:     make([]*types.SwitchState, 0),
				Stairs:     make([]*types.StairsState, 0),
				Monsters:   make([]*types.MonsterState, 0),
			}
		},
	}}
}

func (s *StateSerializer) SerializeBackendState(ctx context.Context, sessionID uuid.UUID, worldType types.WorldType, entities []*ecs.Entity) (*types.BackendGameState, error) {
	backendState := s.backendStatePool.Get().(*types.BackendGameState)
	s.RestBackendStatePool(backendState)
	backendState.SessionID = sessionID
	backendState.WorldType = worldType
	// read once, so every recipient of this broadcast sees one version
	if s.parties != nil {
		backendState.PartyOf = s.parties.Snapshot()
	}

	// a tome run's plan, on the run-level entity (FS-3103M §B R7)
	var plan *components.TomePlanComponent

	for _, entity := range entities {
		// --- Floor (run-level entity; a hub has none) ---
		if fc, hasFloor := entity.GetComponent(ecs.ComponentTypeFloor); hasFloor {
			floor := fc.(*components.FloorComponent)
			backendState.Floor = floor.Depth
			backendState.CellSize = floor.CellSize
		}
		if pc, hasPlan := entity.GetComponent(ecs.ComponentTypeTomePlan); hasPlan {
			plan = pc.(*components.TomePlanComponent)
		}

		// --- Player ---
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)

		if isPlayer {
			// -- get all player components --
			player := pc.(*components.PlayerComponent)
			tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
			transform := tc.(*components.TransformComponent)
			vc, _ := entity.GetComponent(ecs.ComponentTypeVelocity)
			velocity := vc.(*components.VelocityComponent)
			// get player's inventory
			inventory := []*types.ItemState{}
			itemIDListC, _ := entity.GetComponent(ecs.ComponentTypeItemIDList)
			itemIDList := itemIDListC.(*components.ItemIDListComponent)

			equipmentC, ok := entity.GetComponent(ecs.ComponentTypeEquipment)
			equipmentState := &types.EquipmentState{}
			if ok {
				equipment, _ := equipmentC.(*components.EquipmentComponent)

				loadoutEntityIDs := map[string]*uuid.UUID{
					"Weapon":      equipment.WeaponSlot,
					"Head":        equipment.HeadSlot,
					"Chest":       equipment.ChestSlot,
					"Legs":        equipment.LegsSlot,
					"Gloves":      equipment.GlovesSlot,
					"Ring1":       equipment.Ring1Slot,
					"Ring2":       equipment.Ring2Slot,
					"Consumable1": equipment.Consumable1,
					"Consumable2": equipment.Consumable2,
					"Consumable3": equipment.Consumable3,
				}

				loadouts := map[string]*types.ItemState{}

				for key, loadoutID := range loadoutEntityIDs {
					if loadoutID == nil {
						continue
					}
					itemEntity, exists := s.em.GetEntity(*loadoutID)
					if !exists {
						continue
					}
					itemC, ok := itemEntity.GetComponent(ecs.ComponentTypeItem)
					if !ok {
						continue
					}
					item := itemC.(*components.ItemComponent)

					itemState := s.getItemState(item.TemplateID, *loadoutID, item)
					itemState.Quantity = 1
					loadouts[key] = itemState

				}
				equipmentState = &types.EquipmentState{
					Weapon:      loadouts["Weapon"],
					Head:        loadouts["Head"],
					Chest:       loadouts["Chest"],
					Gloves:      loadouts["Gloves"],
					Legs:        loadouts["Legs"],
					Ring1:       loadouts["Ring1"],
					Ring2:       loadouts["Ring2"],
					Consumable1: loadouts["Consumable1"],
					Consumable2: loadouts["Consumable2"],
					Consumable3: loadouts["Consumable3"],
				}

			}

			for _, itemID := range itemIDList.ItemIDs {
				itemEntity, exists := s.em.GetEntity(itemID)
				if exists {
					itemC, _ := itemEntity.GetComponent(ecs.ComponentTypeItem)
					item := itemC.(*components.ItemComponent)

					itemState := s.getItemState(item.TemplateID, itemID, item)

					inventory = append(inventory, itemState)
				}
			}
			curHP, maxHP := 100, 100
			if healthC, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
				h := healthC.(*components.HealthComponent)
				curHP = h.CurrentHealth
				maxHP = h.MaxHealth
			}

			if resource := resourceState(entity); resource != nil {
				backendState.Resources[player.MemberID] = resource
			}
			if parry := parryState(entity); parry != nil {
				backendState.Parries[player.MemberID] = parry
			}
			if timedOpen := timedOpenState(entity); timedOpen != nil {
				backendState.TimedOpens[player.MemberID] = timedOpen
			}

			level, experience := 1, int64(0)
			if statsC, ok := entity.GetComponent(ecs.ComponentTypeStats); ok {
				stats := statsC.(*components.StatsComponent)
				level, experience = max(stats.Level, 1), int64(stats.Experience)
			}

			playerState := &types.PlayerState{
				PublicPlayerState: types.PublicPlayerState{
					ID:       player.MemberID,
					EntityID: entity.ID,
					Username: player.Username,
					Class:    player.Class,
					Position: &types.Position{
						X: transform.X,
						Y: transform.Y,
					},
					Direction: &types.PlayerDirection{
						VX:    velocity.VX,
						VY:    velocity.VY,
						Speed: velocity.Speed,
					},
					Escape:        player.Escape,
					CurrentHealth: curHP,
					MaxHealth:     maxHP,
					Level:         level,
					Experience:    experience,
					LevelFloor:    progression.LevelFloor(int32(level)),
				},
				Inventory: inventory,
				Equipment: equipmentState,
			}
			if next, ok := progression.NextLevelAt(int32(level)); ok {
				playerState.NextLevelAt = &next
			}

			// a body in play is a centre of interest (FS-KE075 §G R37)
			if systems.InPlay(entity) {
				backendState.InPlay[player.MemberID] = types.Position{X: transform.X, Y: transform.Y}
			}

			switch {
			// an escaped delver has left the barrow, so only they see
			// themselves until the run ends (FS-QPDKN §Requirements 24)
			case player.Escape:
				backendState.EscapedCount++
				backendState.Escaped[player.MemberID] = playerState
			// a dead delver left on an earlier floor is not on this one, so only
			// they see themselves (FS-F6F88 §Requirements 15)
			case player.LeftBehind:
				backendState.LeftBehind[player.MemberID] = playerState
			default:
				backendState.Players[player.MemberID] = playerState
			}
		}

		// --- Interactables ---

		// -- Doors --
		doorC, isDoor := entity.GetComponent(ecs.ComponentTypeDoor)
		if isDoor {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			if hasTransform {
				transform := tc.(*components.TransformComponent)
				door := doorC.(*components.DoorComponent)

				isOpen := false
				openableC, hasOpenable := entity.GetComponent(ecs.ComponentTypeOpenable)
				if hasOpenable {
					openable := openableC.(*components.OpenableComponent)
					isOpen = openable.IsOpen
				}

				doorState := &types.DoorState{
					EntityID: entity.ID,
					Position: &types.Position{
						X: transform.X,
						Y: transform.Y,
					},
					Width:  door.Width,
					Height: door.Height,
					IsOpen: isOpen,
				}
				backendState.Doors = append(backendState.Doors, doorState)
			}
		}

		// -- Escape Doors --
		_, isEscapeDoor := entity.GetComponent(ecs.ComponentTypeEscapeDoor)
		if isEscapeDoor {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			if !hasTransform {
				continue
			}
			transform := tc.(*components.TransformComponent)

			isOpen := false
			openableC, hasOpenable := entity.GetComponent(ecs.ComponentTypeOpenable)
			if hasOpenable {
				openable := openableC.(*components.OpenableComponent)
				isOpen = openable.IsOpen
			}

			isLocked := true
			lockableC, hasLockable := entity.GetComponent(ecs.ComponentTypeLockable)
			if hasLockable {
				lockable := lockableC.(*components.LockableComponents)
				isLocked = lockable.IsLocked
			}

			escapeDoorState := &types.EscapeDoorState{
				EntityID: entity.ID,
				Position: &types.Position{
					X: transform.X,
					Y: transform.Y,
				},
				IsOpen:   isOpen,
				IsLocked: isLocked,
			}
			backendState.EscapeDoor = append(backendState.EscapeDoor, escapeDoorState)
		}

		// -- Switches --
		switchComp, isSwitch := entity.GetComponent(ecs.ComponentTypeSwitch)
		if isSwitch {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			if !hasTransform {
				continue
			}
			transform := tc.(*components.TransformComponent)
			switchComponent := switchComp.(*components.SwitchComponent)

			switchState := &types.SwitchState{
				EntityID: entity.ID,
				Position: &types.Position{
					X: transform.X,
					Y: transform.Y,
				},
				SwitchID:    switchComponent.SwitchID,
				IsActivated: switchComponent.IsActivated,
			}
			backendState.Switch = append(backendState.Switch, switchState)
		}

		// -- Stairs (a run's, below the top floor) --
		if entity.HasComponent(ecs.ComponentTypeStairs) {
			if tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform); hasTransform {
				transform := tc.(*components.TransformComponent)
				backendState.Stairs = append(backendState.Stairs, &types.StairsState{
					EntityID: entity.ID,
					Position: &types.Position{X: transform.X, Y: transform.Y},
				})
			}
			continue
		}

		// -- The tome and the altar (a tome run's, FS-3103M §E R14) --
		if entity.HasComponent(ecs.ComponentTypeTome) {
			if tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform); hasTransform {
				transform := tc.(*components.TransformComponent)
				backendState.Tome = &types.TomeState{
					EntityID: entity.ID,
					Position: &types.Position{X: transform.X, Y: transform.Y},
				}
			}
			continue
		}
		if entity.HasComponent(ecs.ComponentTypeAltar) {
			if tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform); hasTransform {
				transform := tc.(*components.TransformComponent)
				backendState.Altar = &types.AltarState{
					EntityID: entity.ID,
					Position: &types.Position{X: transform.X, Y: transform.Y},
				}
			}
			continue
		}

		// -- Gates (the hub's; a run has none) --
		if gc, isGate := entity.GetComponent(ecs.ComponentTypeGate); isGate {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			ic, hasRange := entity.GetComponent(ecs.ComponentTypeInteractable)
			if hasTransform && hasRange {
				transform := tc.(*components.TransformComponent)
				backendState.Gates = append(backendState.Gates, &types.GateState{
					EntityID:    entity.ID,
					Destination: string(gc.(*components.GateComponent).Destination),
					Position:    &types.Position{X: transform.X, Y: transform.Y},
					Range:       ic.(*components.InteractableComponent).Range,
				})
			}
			continue
		}

		// -- Monsters (a run's; the hub never holds one) --
		if mc, isMonster := entity.GetComponent(ecs.ComponentTypeEnemy); isMonster {
			backendState.Monsters = append(backendState.Monsters, monsterState(entity, mc.(*components.MonsterComponent)))
			continue
		}

		// -- NPCs --
		npcComp, isNPC := entity.GetComponent(ecs.ComponentTypeNPC)
		if isNPC {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			if !hasTransform {
				continue
			}
			transform := tc.(*components.TransformComponent)
			npc := npcComp.(*components.NPCComponent)

			backendState.NPCs = append(backendState.NPCs, &types.NPCState{
				EntityID:   entity.ID,
				Name:       npc.Name,
				Function:   string(npc.Function),
				Appearance: npc.Appearance,
				Position:   &types.Position{X: transform.X, Y: transform.Y},
			})
		}

		// -- Burning trails (a run's; the hub never lays one) --
		if tc, isTrail := entity.GetComponent(ecs.ComponentTypeBurningTrail); isTrail {
			trail := tc.(*components.BurningTrailComponent)
			backendState.Trails = append(backendState.Trails, &types.TrailState{
				EntityID:  entity.ID,
				From:      types.Position{X: trail.FromX, Y: trail.FromY},
				To:        types.Position{X: trail.ToX, Y: trail.ToY},
				HalfWidth: trail.HalfWidth,
				Remaining: trail.Remaining,
			})
		}

		// -- Projectiles --
		projComp, isProj := entity.GetComponent(ecs.ComponentTypeProjectile)
		if isProj {
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			vc, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
			if hasTransform && hasVelocity {
				transform := tc.(*components.TransformComponent)
				velocity := vc.(*components.VelocityComponent)
				projComponent := projComp.(*components.ProjectileComponent)

				projState := &types.ProjectileState{
					EntityID:       entity.ID,
					ProjectileType: projComponent.ProjectileType,
					Position: types.Position{
						X: transform.X,
						Y: transform.Y,
					},
					Velocity: types.Velocity{
						Vx: velocity.VX,
						Vy: velocity.VY,
					},
				}
				backendState.Projectiles = append(backendState.Projectiles, projState)
			}
		}

		// -- Containers --
		containerComp, isContainer := entity.GetComponent(ecs.ComponentTypeContainer)
		if isContainer {
			container := containerComp.(*components.ContainerComponent)
			tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
			transform := tc.(*components.TransformComponent)

			isOpen := false
			openableC, hasOpenable := entity.GetComponent(ecs.ComponentTypeOpenable)
			if hasOpenable {
				openable := openableC.(*components.OpenableComponent)
				isOpen = openable.IsOpen
			}

			items := make([]*types.ItemState, 0)
			itemIDListComp, hasItemIDList := entity.GetComponent(ecs.ComponentTypeItemIDList)
			if hasItemIDList {
				itemIDList := itemIDListComp.(*components.ItemIDListComponent)
				for _, itemID := range itemIDList.ItemIDs {
					itemEntity, exists := s.em.GetEntity(itemID)
					if exists {
						itemComp, hasItem := itemEntity.GetComponent(ecs.ComponentTypeItem)
						if hasItem {
							item := itemComp.(*components.ItemComponent)

							itemState := s.getItemState(item.TemplateID, itemID, item)

							items = append(items, itemState)
						}
					}
				}
			}

			kind := container.Kind
			if kind == "" {
				kind = components.ContainerKindChest
			}

			containerState := &types.ContainerState{
				ContainerID: container.ContainerID,
				EntityID:    entity.ID,
				Kind:        string(kind),
				Position: &types.Position{
					X: transform.X,
					Y: transform.Y,
				},
				IsOpen: isOpen,
				Items:  items,
			}
			if container.ReservedFor != uuid.Nil {
				containerState.ReservedFor = container.ReservedFor.String()
			}
			backendState.Containers = append(backendState.Containers, containerState)
		}

		// --- Walls ---
		// a run's walls are its floor map's, never its state's (FS-KE075 §F R34)
		wallComp, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		if isWall && worldType != types.WorldTypeRun {
			wall := wallComp.(*components.WallComponent)
			tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
			if hasTransform {
				transform := tc.(*components.TransformComponent)
				wallState := &types.WallState{
					HouseID:  wall.HouseID,
					EntityID: entity.ID,
					Position: &types.Position{
						X: transform.X,
						Y: transform.Y,
					},
					Width:  wall.Width,
					Height: wall.Height,
				}
				backendState.Walls = append(backendState.Walls, wallState)
			}
		}

		// --- Items ---
		// itemComp, hasItem := entity.GetComponent(ecs.ComponentTypeItem)
		//
		// if hasItem {
		// 	item := itemComp.(*components.ItemComponent)
		//
		// }
	}

	// whether the altar is burned is the run's plan's, read once the whole
	// world has been walked (FS-3103M §B R7)
	if backendState.Altar != nil && plan != nil {
		backendState.Altar.Burned = plan.Burned
	}

	return backendState, nil
}

func (s *StateSerializer) FormatStateToClientState(backendState *types.BackendGameState, playerID uuid.UUID) *types.ClientGameState {
	playerCap := len(backendState.Players) - 1
	if playerCap < 0 {
		playerCap = 0
	}

	// the shared PlayerState is wrapped, never written: a teammate's resource
	// is added for this recipient's frame alone. FS-CH21F §Requirements 1–4.
	// Only its shown part is wrapped, so another player's bag and worn gear are
	// never sent; the part lives in this tick's PlayerState, made afresh by
	// SerializeBackendState, never in the pool's lists. FS-KE075 §I R51, R53,
	// ADR-0064
	party, grouped := backendState.PartyOf[playerID]
	otherPlayers := make([]types.OtherPlayerState, 0, playerCap)
	for id, playerState := range backendState.Players {
		if id == playerID {
			continue
		}
		other := types.OtherPlayerState{PublicPlayerState: &playerState.PublicPlayerState}
		if grouped && backendState.PartyOf[id] == party {
			other.Resource = backendState.Resources[id]
			other.ParryState = backendState.Parries[id]
		}
		otherPlayers = append(otherPlayers, other)
	}

	ownState, present := backendState.Players[playerID]
	if !present {
		ownState, present = backendState.LeftBehind[playerID]
	}
	if !present {
		ownState = backendState.Escaped[playerID]
	}
	// the shared PlayerState is wrapped, never written: the resource is the
	// recipient's alone. FS-8AY7S §Requirements 17–18
	var currentPlayer *types.CurrentPlayerState
	if ownState != nil {
		currentPlayer = &types.CurrentPlayerState{
			PlayerState: ownState,
			Resource:    backendState.Resources[playerID],
			ParryState:  backendState.Parries[playerID],
			TimedOpen:   backendState.TimedOpens[playerID],
		}
	}

	state := &types.ClientGameState{
		SessionID:     backendState.SessionID,
		WorldType:     backendState.WorldType,
		Items:         backendState.Items,
		Doors:         backendState.Doors,
		Containers:    backendState.Containers,
		CurrentPlayer: currentPlayer,
		OtherPlayers:  otherPlayers,
		EscapeDoor:    backendState.EscapeDoor,
		Equipment:     backendState.Equipment,
		Switch:        backendState.Switch,
		NPCs:          backendState.NPCs,
		Projectiles:   backendState.Projectiles,
		EscapedCount:  backendState.EscapedCount,
		Floor:         backendState.Floor,
		Monsters:      backendState.Monsters,
		Trails:        backendState.Trails,
		Gates:         backendState.Gates,
		Tome:          backendState.Tome,
		Altar:         backendState.Altar,
		TomeCarried:   backendState.TomeCarried,
	}

	// on a dungeon floor each recipient is sent only what lies near it
	// (FS-KE075 §G, ADR-0060 Decisions 4 and 6)
	if backendState.WorldType == types.WorldTypeRun && backendState.CellSize > 0 {
		if centres := interestCentres(backendState, playerID); len(centres) > 0 {
			state.Monsters = nearAny(backendState.Monsters, centres, monsterAt)
			state.Containers = nearAny(backendState.Containers, centres, containerAt)
			// the tome is hidden: cut as a container is (FS-3103M §E R14)
			if state.Tome != nil && !isNearAny(*state.Tome.Position, centres) {
				state.Tome = nil
			}
		}
	}

	// the hub and a field say where their walls are, an empty list when none;
	// a run leaves the key out. The slice header is copied, as the stairs' is.
	if backendState.WorldType != types.WorldTypeRun {
		walls := backendState.Walls
		state.Walls = &walls
	}

	// a run always says where its stairs are, even when there are none
	if backendState.WorldType == types.WorldTypeRun {
		stairs := backendState.Stairs
		if stairs == nil {
			stairs = []*types.StairsState{}
		}
		state.Stairs = &stairs
	}

	return state
}

func (s *StateSerializer) RestBackendStatePool(state *types.BackendGameState) {
	for k := range state.Players {
		delete(state.Players, k)
	}
	for k := range state.LeftBehind {
		delete(state.LeftBehind, k)
	}
	for k := range state.Escaped {
		delete(state.Escaped, k)
	}
	for k := range state.Resources {
		delete(state.Resources, k)
	}
	for k := range state.Parries {
		delete(state.Parries, k)
	}
	for k := range state.TimedOpens {
		delete(state.TimedOpens, k)
	}
	// the published snapshot is shared, so it is let go, never cleared
	state.PartyOf = nil
	for k := range state.InPlay {
		delete(state.InPlay, k)
	}
	// the lists are what a sent frame holds until its writer encodes it, so
	// each is let go and started afresh, never refilled in place (FS-QG1HR D2
	// race B, FS-KE075 §G R38)
	state.Items = fresh(state.Items)
	state.Doors = fresh(state.Doors)
	state.Walls = fresh(state.Walls)
	state.Containers = fresh(state.Containers)
	state.EscapeDoor = fresh(state.EscapeDoor)
	state.Switch = fresh(state.Switch)
	state.NPCs = fresh(state.NPCs)
	state.Projectiles = fresh(state.Projectiles)
	state.SessionID = uuid.Nil
	state.EscapedCount = 0
	state.Floor = 0
	state.CellSize = 0
	state.Stairs = fresh(state.Stairs)
	state.Monsters = fresh(state.Monsters)
	state.Trails = fresh(state.Trails)
	state.Gates = fresh(state.Gates)
	// a sent frame keeps its own pointers; the next tick makes new ones
	state.Tome = nil
	state.Altar = nil
	state.TomeCarried = false
}

// fresh is an empty list on new memory as large as the old, or nil if it was
// nil, so an empty list encodes as it did before the reset.
func fresh[T any](list []T) []T {
	if list == nil {
		return nil
	}
	return make([]T, 0, cap(list))
}

// interestRadius is how far from an interest centre, in world px, a dungeon
// floor's monsters and containers are still sent. FS-KE075 §G R36.
const interestRadius = 1600.0

// interestCentres are where a recipient's interest is measured from: its own
// body while in play, else every body in play, so a spectator is sent what the
// teammates are. None when no one is in play: then nothing is cut.
// FS-KE075 §G R37.
func interestCentres(backendState *types.BackendGameState, playerID uuid.UUID) []types.Position {
	if own, inPlay := backendState.InPlay[playerID]; inPlay {
		return []types.Position{own}
	}
	centres := make([]types.Position, 0, len(backendState.InPlay))
	for _, at := range backendState.InPlay {
		centres = append(centres, at)
	}
	return centres
}

// nearAny is a new list of those in list standing within the interest radius
// of any centre, in their order. It never shares memory with list.
func nearAny[T any](list []T, centres []types.Position, at func(T) types.Position) []T {
	kept := make([]T, 0, len(list))
	for _, entity := range list {
		if isNearAny(at(entity), centres) {
			kept = append(kept, entity)
		}
	}
	return kept
}

// isNearAny is whether p lies within the interest radius of any centre.
func isNearAny(p types.Position, centres []types.Position) bool {
	for _, c := range centres {
		if math.Hypot(p.X-c.X, p.Y-c.Y) <= interestRadius {
			return true
		}
	}
	return false
}

func monsterAt(m *types.MonsterState) types.Position { return m.Position }

func containerAt(c *types.ContainerState) types.Position { return *c.Position }

// resourceState is a delver's class resource as its owner is told it, its
// ability priced in that pool; nil when the delver carries none.
// FS-8AY7S §Requirements 17.
func resourceState(entity *ecs.Entity) *types.ResourceState {
	rc, ok := entity.GetComponent(ecs.ComponentTypeResource)
	if !ok {
		return nil
	}
	pool := rc.(*components.ResourceComponent)

	state := &types.ResourceState{Kind: string(pool.Kind), Current: pool.Current, Max: pool.Max}
	if ac, ok := entity.GetComponent(ecs.ComponentTypeAbility); ok {
		state.AbilityCost = systems.AttackCost(ac.(*components.AbilityComponent).Kind)
	}
	return state
}

// parryState is a mercenary's parry stance as its owner is told it; nil for
// anyone without one. FS-MAMHR §Requirements 28.
func parryState(entity *ecs.Entity) *types.ParryState {
	pc, ok := entity.GetComponent(ecs.ComponentTypeParry)
	if !ok {
		return nil
	}
	stance := pc.(*components.ParryComponent)
	return &types.ParryState{ParryOpen: stance.Open, ParryLockout: stance.LockoutRemaining, Parries: stance.Parries}
}

// timedOpenState is a delver's timed open as its owner is told it; nil for
// anyone without one. FS-MQYEX §Requirements 18.
func timedOpenState(entity *ecs.Entity) *types.TimedOpenState {
	oc, ok := entity.GetComponent(ecs.ComponentTypeTimedOpen)
	if !ok {
		return nil
	}
	open := oc.(*components.TimedOpenComponent)
	return &types.TimedOpenState{EntityID: open.ContainerID, Elapsed: open.Elapsed, Duration: open.Duration}
}

// monsterState is a monster as the client draws it. One at no health lies dead,
// whatever it was last doing.
func monsterState(entity *ecs.Entity, monster *components.MonsterComponent) *types.MonsterState {
	state := &types.MonsterState{
		EntityID:  entity.ID,
		Archetype: string(monster.Archetype),
		Name:      monster.Name,
		Level:     monster.Level,
		Elite:     monster.Elite,
		Boss:      monster.Boss,
		Facing:    types.Position{X: monster.FacingX, Y: monster.FacingY},
		Action:    string(monster.Action),
	}

	if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
		transform := tc.(*components.TransformComponent)
		state.Position = types.Position{X: transform.X, Y: transform.Y}
	}

	if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
		health := hc.(*components.HealthComponent)
		state.CurrentHealth = health.CurrentHealth
		state.MaxHealth = health.MaxHealth
		if health.CurrentHealth <= 0 {
			state.Action = string(components.MonsterActionDead)
		}
	}

	return state
}

func (s *StateSerializer) PutBackendState(state *types.BackendGameState) {
	s.backendStatePool.Put(state)
}

// grab the item
// getItemState is an item as the client is shown it, whatever its type: its
// stats (zero ones are left off the wire), the level it requires and its roll.
// FS-BDA7X §Requirements 30, FS-4R9M9 §Requirements 54.
func (s *StateSerializer) getItemState(itemID uuid.UUID, entityID uuid.UUID, item *components.ItemComponent) *types.ItemState {
	return ItemStateOf(itemID, entityID, item)
}

// ItemStateOf is an item as the WS item shape carries it: its stats (zero ones
// left off the wire), the level it requires and its roll. The one conversion,
// for world state and settlement records alike.
func ItemStateOf(itemID uuid.UUID, entityID uuid.UUID, item *components.ItemComponent) *types.ItemState {
	return &types.ItemState{
		ItemID:          itemID,
		EntityID:        entityID,
		Name:            item.Name,
		ItemType:        item.ItemType,
		AttackPower:     int32(item.AttackPower),
		CriticalRate:    float32(item.CriticalRate),
		WeaponType:      item.WeaponType,
		DefenseRating:   int32(item.DefenseRating),
		MagicResistance: int32(item.MagicResistance),
		ArmorSlot:       item.ArmorSlot,
		HealingAmount:   int32(item.HealingAmount),
		ManaAmount:      int32(item.ManaAmount),
		Description:     item.Description,
		RequiredLevel:   item.RequiredLevel,
		Rarity:          item.RarityCode,
		ItemLevel:       item.ItemLevel,
		Affixes:         item.Affixes,
		UniqueEffect:    item.UniqueEffectText,
		Unsafe:          item.Unsafe,
	}
}
