package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// monsterDrops is the kill consumer that rolls the drop table once per kill
// record and lays what drops in a drop pile where the monster fell.
// FS-4R9M9 §Requirements 44–46. It runs on the run's tick (KillConsumer), so it
// changes the world without the session lock and never blocks. The killer's
// own state does not matter: the loot still lands.
type monsterDrops struct {
	s *Session
	r lootRand // the chance, count and type rolls
}

func newMonsterDrops(s *Session, r lootRand) *monsterDrops {
	return &monsterDrops{s: s, r: r}
}

func (m *monsterDrops) ConsumeKill(record systems.KillRecord) {
	table, ok := monsterDropFor(record)
	if !ok || m.r.Float64() >= table.Chance {
		return
	}

	n := table.MinItems
	if table.MaxItems > table.MinItems {
		n += m.r.IntN(table.MaxItems - table.MinItems + 1)
	}

	drop := lootDrop{ItemLevel: record.Level, Source: table.Source}
	itemIDs := make([]uuid.UUID, 0, n)
	for range n {
		itemType := pickItemType(m.r, table.TypeSplit)
		itemIDs = append(itemIDs, m.s.dropLoot(itemType, m.s.itemPool.of(itemType), 1, drop)...)
	}
	if len(itemIDs) == 0 {
		return
	}

	CreateDropPileEntity(m.s.EntityManager, record.X, record.Y, itemIDs)
}

// monsterDropFor is the drop table row a kill rolls: the boss's, else an
// elite's, else its archetype's.
func monsterDropFor(record systems.KillRecord) (MonsterDrop, bool) {
	switch {
	case record.Boss:
		return BossMonsterDrop, true
	case record.Elite:
		return EliteMonsterDrop, true
	}
	table, ok := MonsterDrops[record.Archetype]
	return table, ok
}

// pickItemType draws one item type by weight.
func pickItemType(r lootRand, split []ItemTypeWeight) types.ItemType {
	total := 0
	for _, w := range split {
		total += w.Weight
	}
	if total <= 0 {
		return ""
	}
	x := r.IntN(total)
	for _, w := range split {
		if x < w.Weight {
			return w.ItemType
		}
		x -= w.Weight
	}
	return split[len(split)-1].ItemType
}
