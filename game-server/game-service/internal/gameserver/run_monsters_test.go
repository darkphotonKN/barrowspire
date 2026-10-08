package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
)

// monsterCount is how many monsters a world holds.
func monsterCount(world *game.Session) int {
	n := 0
	for _, e := range world.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) {
			n++
		}
	}
	return n
}

// A run is populated once its roster is placed, so monsters are levelled to the
// party and kept clear of where it stands; the hub never holds one, before the
// run or after everyone comes home. FS-77AB6 §Requirements 22.
func TestCreateGameSession_PopulatesTheRunAndNeverTheHub(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	hub, _ := server.HubSession()

	wren, _ := enterHub(t, server, "Wren")
	kaelen, _ := enterHub(t, server, "Kaelen")
	assert.Zero(t, monsterCount(hub), "the hub before the run")

	run := server.CreateGameSession([]*types.Player{wren, kaelen})

	assert.Positive(t, monsterCount(run), "the run was built before its roster stood on it")
	assert.LessOrEqual(t, monsterCount(run), game.MonsterCountMax+1, "the standard count, plus at most one demon")
	assert.Zero(t, monsterCount(hub), "the hub during the run")

	server.ReturnPlayersToHub(run.ID)

	assert.Zero(t, monsterCount(hub), "the hub after the run")
}
