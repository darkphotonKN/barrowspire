package serializer

import (
	"context"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"sync"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The state serializer struct is in charge of serializing all complex game
* state in the form of entity and components into client consumable state.
**/
type StateSerializer struct {
	em               *ecs.EntityManager
	backendStatePool *sync.Pool
}

func NewStateSerializer(em *ecs.EntityManager) *StateSerializer {
	return &StateSerializer{em: em, backendStatePool: &sync.Pool{
		New: func() interface{} {
			return &types.BackendGameState{
				Players:    make(map[uuid.UUID]*types.PlayerState),
				LeftBehind: make(map[uuid.UUID]*types.PlayerState),
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

	for _, entity := range entities {
		// --- Floor (run-level entity; a hub has none) ---
		if fc, hasFloor := entity.GetComponent(ecs.ComponentTypeFloor); hasFloor {
			floor := fc.(*components.FloorComponent)
			backendState.Floor = floor.Depth
			backendState.FloorCount = floor.Count
		}

		// --- Player ---
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)

		if isPlayer {
			// -- get all player components --
			player := pc.(*components.PlayerComponent)
			if player.Escape {
				backendState.EscapedCount++
				continue
			}
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

			curMP, maxMP := 100, 100
			if manaC, ok := entity.GetComponent(ecs.ComponentTypeMana); ok {
				m := manaC.(*components.ManaComponent)
				curMP = m.CurrentMana
				maxMP = m.MaxMana
			}

			level, experience := 1, int64(0)
			if statsC, ok := entity.GetComponent(ecs.ComponentTypeStats); ok {
				stats := statsC.(*components.StatsComponent)
				level, experience = max(stats.Level, 1), int64(stats.Experience)
			}

			playerState := &types.PlayerState{
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
				Inventory:     inventory,
				Equipment:     equipmentState,
				Escape:        player.Escape,
				CurrentHealth: curHP,
				MaxHealth:     maxHP,
				CurrentMana:   curMP,
				MaxMana:       maxMP,
				Level:         level,
				Experience:    experience,
				LevelFloor:    progression.LevelFloor(int32(level)),
			}
			if next, ok := progression.NextLevelAt(int32(level)); ok {
				playerState.NextLevelAt = &next
			}

			// a dead delver left on an earlier floor is not on this one, so only
			// they see themselves (FS-F6F88 §Requirements 15)
			if player.LeftBehind {
				backendState.LeftBehind[player.MemberID] = playerState
			} else {
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
			backendState.Containers = append(backendState.Containers, containerState)
		}

		// --- Walls ---
		wallComp, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		if isWall {
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

	return backendState, nil
}

func (s *StateSerializer) FormatStateToClientState(backendState *types.BackendGameState, playerID uuid.UUID) *types.ClientGameState {
	playerCap := len(backendState.Players) - 1
	if playerCap < 0 {
		playerCap = 0
	}

	otherPlayers := make([]*types.PlayerState, 0, playerCap)
	for id, playerState := range backendState.Players {
		if id != playerID {
			otherPlayers = append(otherPlayers, playerState)
		}
	}

	currentPlayer, present := backendState.Players[playerID]
	if !present {
		currentPlayer = backendState.LeftBehind[playerID]
	}

	state := &types.ClientGameState{
		SessionID:     backendState.SessionID,
		WorldType:     backendState.WorldType,
		Items:         backendState.Items,
		Doors:         backendState.Doors,
		Walls:         backendState.Walls,
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
		FloorCount:    backendState.FloorCount,
		Monsters:      backendState.Monsters,
		Trails:        backendState.Trails,
	}

	// a run always says where its stairs are, even when there are none; the
	// slice header is copied, so the pooled backend state's reset cannot reach it
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
	state.Items = state.Items[:0]
	state.Doors = state.Doors[:0]
	state.Walls = state.Walls[:0]
	state.Containers = state.Containers[:0]
	state.EscapeDoor = state.EscapeDoor[:0]
	state.Switch = state.Switch[:0]
	state.NPCs = state.NPCs[:0]
	state.Projectiles = state.Projectiles[:0]
	state.SessionID = uuid.Nil
	state.EscapedCount = 0
	state.Floor = 0
	state.FloorCount = 0
	state.Stairs = state.Stairs[:0]
	state.Monsters = state.Monsters[:0]
	state.Trails = state.Trails[:0]
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
	}
}
