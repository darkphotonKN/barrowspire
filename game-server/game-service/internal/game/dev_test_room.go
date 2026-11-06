package game

import (
	"math"
	"slices"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/*
	The dev test room (FS-BDRTJ): a throwaway field for trying builds by feel,
	built only when the pod boots with ENVIRONMENT development. Its visits never
	settle (Server.settleVisit), which is what keeps everything in here from ever
	reaching a character or an inventory.
*/

// The room's map, and how long a taken item or a dead enemy stays gone. R6, R13, R16.
const (
	devTestRoomWidth  = 900
	devTestRoomHeight = 600

	devTestRoomComeBack = 2.0 // s
)

// devTestRoomHubGate is deliberately not in hubGates: that table feeds the
// golden and lane tests, and every player's hub. R4.
var devTestRoomHubGate = hubGate{
	Destination: components.GateDestinationDevTestRoom,
	X:           120,
	Y:           900,
	Arrival:     &components.GateArrival{X: 260, Y: 900},
}

// devTestRoomLayout is an empty layout: the room's chests and enemies are its
// own, so the field population holds nothing and the restock never runs. R7.
type devTestRoomLayout struct{}

func (devTestRoomLayout) Layout() (FieldLayout, error) { return FieldLayout{}, nil }

// DevTestRoom is the room as a place. R6, R7.
func DevTestRoom() FieldPlace {
	return FieldPlace{
		ID:            FieldDevTestRoom,
		Width:         devTestRoomWidth,
		Height:        devTestRoomHeight,
		Layout:        devTestRoomLayout{},
		Entrance:      FieldPoint{X: 40, Y: 300},
		EntranceRange: constants.FieldEntranceRange,
		Arrival:       FieldPoint{X: 180, Y: 300},
		HubGate:       components.GateDestinationDevTestRoom,
	}
}

// DevTestRoomSeat is what a body in the room is seated as: the character at max
// level, and an empty loadout. Not nil: SeatVisitor refuses a nil one. The
// character is a copy; the record is never touched. R8, R9.
func DevTestRoomSeat(character types.CharacterInPlay) (types.CharacterInPlay, *pbitems.CheckOutRunGearResponse) {
	character.Level = int(progression.MaxLevel)
	return character, &pbitems.CheckOutRunGearResponse{Loadout: &pbitems.GetLoadoutWithItemsResponse{}}
}

// AddDevTestRoomGate stands the room's gate in the hub. Called once at boot, only
// when the room is on, before anyone can connect. R3, R4.
func (s *Session) AddDevTestRoomGate() {
	s.indexGate(CreateGateEntity(s.EntityManager, devTestRoomHubGate))
}

// devTestRoomState is the room's chests and enemies, touched by the tick alone
// once built.
type devTestRoomState struct {
	items   []devTestRoomItem
	enemies []devTestRoomEnemy
}

// devTestRoomItem is one listed item's place in its chest: the entity standing
// there (uuid.Nil once taken) and how long until a new one does.
type devTestRoomItem struct {
	config   types.ItemConfig
	chest    *components.ItemIDListComponent
	held     uuid.UUID
	refillIn float64
}

// devTestRoomEnemy is one enemy: the one standing (uuid.Nil once dead), the
// corpse left of the last, and how long until the next.
type devTestRoomEnemy struct {
	config    MonsterConfig
	standing  uuid.UUID
	corpse    uuid.UUID
	respawnIn float64
}

/**
* buildDevTestRoom stands the room's chests, full and already open so nothing
* ever rolls, and its enemies. R11, R12, R14.
**/
func (s *Session) buildDevTestRoom() {
	room := &devTestRoomState{}

	for _, chest := range devTestRoomChests() {
		entity := CreateContainerEntity(s.EntityManager, ContainerConfig{X: chest.at.X, Y: chest.at.Y}, nil)
		oc, _ := entity.GetComponent(ecs.ComponentTypeOpenable)
		openable := oc.(*components.OpenableComponent)
		openable.IsOpen, openable.HasBeenOpened = true, true

		lc, _ := entity.GetComponent(ecs.ComponentTypeItemIDList)
		list := lc.(*components.ItemIDListComponent)
		for _, config := range chest.items {
			held := CreateItemEntity(s.EntityManager, config).ID
			list.ItemIDs = append(list.ItemIDs, held)
			room.items = append(room.items, devTestRoomItem{config: config, chest: list, held: held})
		}
	}

	for _, config := range devTestRoomEnemies {
		room.enemies = append(room.enemies, devTestRoomEnemy{config: config, standing: s.spawnDevTestRoomEnemy(config)})
	}

	s.mu.Lock()
	s.devTestRoom = room
	s.mu.Unlock()
}

// spawnDevTestRoomEnemy spawns the enemy without its Velocity: MonsterAISystem
// skips what has none, so it never moves or strikes, and resolveCollision ignores
// it, so it can be walked through. R15.
func (s *Session) spawnDevTestRoomEnemy(config MonsterConfig) uuid.UUID {
	entity := CreateMonsterEntity(s.EntityManager, config)
	entity.RemoveComponent(ecs.ComponentTypeVelocity)
	return entity.ID
}

// tickDevTestRoom is the room's share of a tick; every other world has none.
func (s *Session) tickDevTestRoom(deltaTime float64) {
	s.mu.RLock()
	room := s.devTestRoom
	s.mu.RUnlock()

	if room == nil {
		return
	}
	s.respawnDevTestRoomEnemies(room, deltaTime)
	s.restockDevTestRoomItems(room, deltaTime)
}

// respawnDevTestRoomEnemies replaces each dead enemy once it has lain the delay.
// That is ahead of MonsterCorpseLifetime, so the corpse goes with it; one already
// gone is no matter. R16.
func (s *Session) respawnDevTestRoomEnemies(room *devTestRoomState, deltaTime float64) {
	for i := range room.enemies {
		enemy := &room.enemies[i]

		if enemy.standing != uuid.Nil {
			if s.devTestRoomEnemyStands(enemy.standing) {
				continue
			}
			enemy.corpse, enemy.standing = enemy.standing, uuid.Nil
			enemy.respawnIn = devTestRoomComeBack
			continue
		}

		enemy.respawnIn -= deltaTime
		if enemy.respawnIn > 0 {
			continue
		}
		s.EntityManager.RemoveEntity(enemy.corpse)
		enemy.standing = s.spawnDevTestRoomEnemy(enemy.config)
	}
}

// devTestRoomEnemyStands is whether the enemy is in the world and not lying dead.
func (s *Session) devTestRoomEnemyStands(id uuid.UUID) bool {
	entity, ok := s.EntityManager.GetEntity(id)
	if !ok {
		return false
	}
	mc, ok := entity.GetComponent(ecs.ComponentTypeEnemy)
	return ok && mc.(*components.MonsterComponent).Action != components.MonsterActionDead
}

// restockDevTestRoomItems puts a new copy of each taken item back in its chest
// once the delay has run. Under the world's lock and copying the list, as a
// pickup writes it. What was taken stays the taker's. R13.
func (s *Session) restockDevTestRoomItems(room *devTestRoomState, deltaTime float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range room.items {
		item := &room.items[i]

		if item.held != uuid.Nil {
			if !slices.Contains(item.chest.ItemIDs, item.held) {
				item.held = uuid.Nil
				item.refillIn = devTestRoomComeBack
			}
			continue
		}

		item.refillIn -= deltaTime
		if item.refillIn > 0 {
			continue
		}
		item.held = CreateItemEntity(s.EntityManager, item.config).ID
		item.chest.ItemIDs = append(slices.Clone(item.chest.ItemIDs), item.held)
	}
}

// The room's enemies, in the middle of the room. R14.
var devTestRoomEnemies = []MonsterConfig{
	{Archetype: components.MonsterArchetypeTroll, Level: int(progression.MaxLevel), X: 450, Y: 150},
	{Archetype: components.MonsterArchetypeTroll, Level: int(progression.MaxLevel), Elite: true, Name: "Elite Troll", X: 450, Y: 450},
	{Archetype: components.MonsterArchetypeDemon, Level: int(progression.MaxLevel), Boss: true, X: 450, Y: 300},
}

// devTestRoomChest is one chest and what it holds.
type devTestRoomChest struct {
	at    FieldPoint
	items []types.ItemConfig
}

// devTestRoomChests are the four chests near the arrival point: weapons, armor,
// rings and uniques. R12.
func devTestRoomChests() []devTestRoomChest {
	return []devTestRoomChest{
		{at: FieldPoint{X: 280, Y: 150}, items: devTestRoomWeapons()},
		{at: FieldPoint{X: 280, Y: 250}, items: devTestRoomArmor()},
		{at: FieldPoint{X: 280, Y: 350}, items: devTestRoomRings()},
		{at: FieldPoint{X: 280, Y: 450}, items: devTestRoomUniques()},
	}
}

/*
	The fixed item list. R11. Bases are the catalogue's tier III rows and the six
	uniques as scripts/seed-dev.sh seeds them (FS-4R9M9 R31): migration 000024 only
	makes the tables. Stats are the top of a Runed roll, affixes the top of their
	last band in AffixTable; a unique's fixed affixes the top of their range.
*/

// devTierThreeRequired is the catalogue's tier III required level.
const devTierThreeRequired = 13

// devTop is a base stat at the top of a Runed roll.
func devTop(base int) int {
	return int(math.Round(float64(base) * LootStatSpreadMax * RarityRolls[rarityRuned].StatMultiplier))
}

// devTopAffixes are the stats at the top of their last band.
func devTopAffixes(stats ...string) []types.Affix {
	affixes := make([]types.Affix, 0, len(stats))
	for _, stat := range stats {
		for _, rule := range AffixTable {
			if rule.Stat == stat {
				affixes = append(affixes, types.Affix{Stat: stat, Tier: len(rule.Bands), Value: rule.Bands[len(rule.Bands)-1].Max})
			}
		}
	}
	return affixes
}

// devItem is the identity every listed item shares. Its template id is fixed by
// its name, and it has no instance: it exists in this world's memory alone.
func devItem(itemType types.ItemType, name, rarity string, requiredLevel int) types.ItemConfig {
	return types.ItemConfig{
		TemplateID:    uuid.NewSHA1(uuid.NameSpaceOID, []byte("dev_test_room/"+name)),
		ItemType:      itemType,
		Name:          name,
		RarityCode:    rarity,
		RequiredLevel: requiredLevel,
		ItemLevel:     int(progression.MaxLevel),
	}
}

func devTestRoomWeapons() []types.ItemConfig {
	rows := []struct {
		name, weaponType string
		attack           int
		crit             float64
		attribute        string
	}{
		{"Blackiron Sword", "sword", 9, 0.08, types.AffixStrength},
		{"Grave Seax", "knife", 5, 0.15, types.AffixAgility},
		{"Blackiron Mace", "mace", 14, 0.02, types.AffixStrength},
		{"Partisan", "spear", 8, 0.06, types.AffixAgility},
		{"Dane Axe", "axe", 11, 0.05, types.AffixStrength},
		{"Blackiron Cestus", "fist", 6, 0.10, types.AffixAgility},
	}

	items := make([]types.ItemConfig, 0, len(rows))
	for _, row := range rows {
		item := devItem(types.ItemTypeWeapon, row.name, rarityRuned, devTierThreeRequired)
		item.WeaponType = row.weaponType
		item.AttackPower = devTop(row.attack)
		item.CriticalRate = math.Round(min(row.crit+LootCritSpread, LootCritCap)*100) / 100
		item.Affixes = devTopAffixes(row.attribute, types.AffixFlatDamage, types.AffixAttackSpeed, types.AffixCritChance)
		items = append(items, item)
	}
	return items
}

func devTestRoomArmor() []types.ItemConfig {
	affixes := map[types.ArmorSlot][]string{
		types.ArmorSlotHead:   {types.AffixMaxHealth, types.AffixMaxMana, types.AffixDefense, types.AffixCritChance},
		types.ArmorSlotChest:  {types.AffixMaxHealth, types.AffixMaxMana, types.AffixDefense, types.AffixMagicResistance},
		types.ArmorSlotLegs:   {types.AffixMoveSpeed, types.AffixMaxHealth, types.AffixDefense, types.AffixMagicResistance},
		types.ArmorSlotGloves: {types.AffixAttackSpeed, types.AffixFlatDamage, types.AffixCritChance, types.AffixMaxHealth},
	}
	rows := []struct {
		name            string
		slot            types.ArmorSlot
		defense, resist int
	}{
		{"Studded Leather Cap", types.ArmorSlotHead, 3, 2},
		{"Studded Leather Jerkin", types.ArmorSlotChest, 6, 2},
		{"Studded Leather Leggings", types.ArmorSlotLegs, 5, 2},
		{"Studded Leather Gloves", types.ArmorSlotGloves, 2, 2},
		{"Wight-bone Helm", types.ArmorSlotHead, 2, 5},
		{"Wight-bone Armor", types.ArmorSlotChest, 5, 8},
		{"Wight-bone Leggings", types.ArmorSlotLegs, 3, 6},
		{"Wight-bone Gloves", types.ArmorSlotGloves, 2, 3},
		{"Scale Coif", types.ArmorSlotHead, 5, 2},
		{"Scale Tunic", types.ArmorSlotChest, 9, 3},
		{"Scale Leggings", types.ArmorSlotLegs, 6, 2},
		{"Scale Gauntlets", types.ArmorSlotGloves, 3, 2},
		{"Blackiron Helm", types.ArmorSlotHead, 8, 0},
		{"Blackiron Breastplate", types.ArmorSlotChest, 13, 1},
		{"Blackiron Greaves", types.ArmorSlotLegs, 9, 0},
		{"Blackiron Gauntlets", types.ArmorSlotGloves, 5, 0},
	}

	items := make([]types.ItemConfig, 0, len(rows))
	for _, row := range rows {
		item := devItem(types.ItemTypeArmor, row.name, rarityRuned, devTierThreeRequired)
		item.ArmorSlot = row.slot
		item.DefenseRating = devTop(row.defense)
		item.MagicResistance = devTop(row.resist)
		item.Affixes = devTopAffixes(affixes[row.slot]...)
		items = append(items, item)
	}
	return items
}

func devTestRoomRings() []types.ItemConfig {
	rows := []struct {
		name  string
		stats []string
	}{
		{"Barrow-gold Band of Might", []string{types.AffixStrength, types.AffixFlatDamage, types.AffixAttackSpeed, types.AffixCritChance}},
		{"Barrow-gold Band of Haste", []string{types.AffixAgility, types.AffixFlatDamage, types.AffixAttackSpeed, types.AffixMoveSpeed}},
		{"Barrow-gold Band of Wits", []string{types.AffixIntelligence, types.AffixMaxMana, types.AffixFlatDamage, types.AffixCritChance}},
		{"Barrow-gold Band of Warding", []string{types.AffixMaxHealth, types.AffixDefense, types.AffixMagicResistance, types.AffixMoveSpeed}},
	}

	items := make([]types.ItemConfig, 0, len(rows))
	for _, row := range rows {
		item := devItem(types.ItemTypeRing, row.name, rarityRuned, devTierThreeRequired)
		item.Affixes = devTopAffixes(row.stats...)
		items = append(items, item)
	}
	return items
}

func devTestRoomUniques() []types.ItemConfig {
	wightfang := devItem(types.ItemTypeWeapon, "Wightfang", rarityFabled, 5)
	wightfang.WeaponType = "knife"
	wightfang.AttackPower = devTop(4)
	wightfang.CriticalRate = 0.18 + LootCritSpread
	wightfang.UniqueEffectCode = types.UniqueEffectKillFrenzy
	wightfang.UniqueEffectText = "Each kill grants +15% attack speed for 4 seconds, stacking up to 3 times."
	wightfang.Affixes = []types.Affix{{Stat: types.AffixAgility, Value: 4}, {Stat: types.AffixAttackSpeed, Value: 6}}

	oath := devItem(types.ItemTypeArmor, "Gravewarden's Oath", rarityFabled, 7)
	oath.ArmorSlot = types.ArmorSlotChest
	oath.DefenseRating, oath.MagicResistance = devTop(10), devTop(1)
	oath.UniqueEffectCode = types.UniqueEffectMeleeReflect
	oath.UniqueEffectText = "Reflects 20% of melee damage taken back to the attacker."
	oath.Affixes = []types.Affix{{Stat: types.AffixMaxHealth, Value: 16}, {Stat: types.AffixStrength, Value: 3}}

	lantern := devItem(types.ItemTypeRing, "Lantern of the Drowned", rarityFabled, 9)
	lantern.UniqueEffectCode = types.UniqueEffectPierce
	lantern.UniqueEffectText = "Your projectiles pierce one extra target."
	lantern.Affixes = []types.Affix{{Stat: types.AffixIntelligence, Value: 4}, {Stat: types.AffixMaxMana, Value: 16}, {Stat: types.AffixMagicResistance, Value: 3}}

	crown := devItem(types.ItemTypeArmor, "The Hollow Crown", rarityFabled, 10)
	crown.ArmorSlot = types.ArmorSlotHead
	crown.DefenseRating, crown.MagicResistance = devTop(2), devTop(5)
	crown.UniqueEffectCode = types.UniqueEffectKillHeal
	crown.UniqueEffectText = "Kills restore 4% of your maximum health."
	crown.Affixes = []types.Affix{{Stat: types.AffixMaxHealth, Value: 18}, {Stat: types.AffixDefense, Value: 3}}

	greaves := devItem(types.ItemTypeArmor, "Ashwalk Greaves", rarityFabled, 12)
	greaves.ArmorSlot = types.ArmorSlotLegs
	greaves.DefenseRating, greaves.MagicResistance = devTop(4), devTop(2)
	greaves.UniqueEffectCode = types.UniqueEffectBurningDash
	greaves.UniqueEffectText = "Dashing leaves a burning trail that scorches monsters."
	greaves.Affixes = []types.Affix{{Stat: types.AffixMoveSpeed, Value: 8}, {Stat: types.AffixAgility, Value: 4}}

	king := devItem(types.ItemTypeRing, "Ring of the Last King", rarityFabled, 16)
	king.UniqueEffectCode = types.UniqueEffectFloorAttributes
	king.UniqueEffectText = "+1 to all attributes for each floor climbed this run."
	king.Affixes = []types.Affix{{Stat: types.AffixStrength, Value: 2}, {Stat: types.AffixAgility, Value: 2}, {Stat: types.AffixIntelligence, Value: 2}, {Stat: types.AffixCritChance, Value: 2}}

	return []types.ItemConfig{wightfang, oath, lantern, crown, greaves, king}
}
