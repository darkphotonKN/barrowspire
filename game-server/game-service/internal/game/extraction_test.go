package game

import (
	"context"
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// homeReturner sends a run's delvers home the way the server does: each one is
// removed from the run's world before the run closes.
type homeReturner struct {
	run *Session
}

func (h *homeReturner) ReturnPlayersToHub(_ uuid.UUID) {
	for _, playerID := range h.run.GetPlayerIDs() {
		h.run.RemovePlayer(playerID.String())
	}
}

func (h *homeReturner) ApplyRunProgress(_ []types.RunProgress) {}

func (h *homeReturner) SeatsReleased(_ uuid.UUID, _ []uuid.UUID) {}

func (h *homeReturner) CloseSession(_ uuid.UUID) error { return nil }

// capturingOutbox keeps every event the match-complete publish writes, and the
// row id it was written under.
type capturingOutbox struct {
	mu     sync.Mutex
	events map[string][]byte
	ids    map[string]uuid.UUID
	// all keeps every row under each routing key, in write order: a run now
	// writes a pair per settled player as well as its end (FS-GV8WN)
	all map[string][][]byte
}

func (c *capturingOutbox) CreateOutboxTx(_ context.Context, _ *sqlx.Tx, params commonoutbox.OutboxParams) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.events == nil {
		c.events = map[string][]byte{}
		c.ids = map[string]uuid.UUID{}
		c.all = map[string][][]byte{}
	}
	c.events[params.RoutingKey] = params.Payload
	c.all[params.RoutingKey] = append(c.all[params.RoutingKey], params.Payload)
	c.ids[params.RoutingKey] = params.ID
	return nil
}

// rowID is the id the last row under routingKey was written with.
func (c *capturingOutbox) rowID(t *testing.T, routingKey string) uuid.UUID {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	id, ok := c.ids[routingKey]
	require.True(t, ok, "no %s row was written", routingKey)
	return id
}

func (c *capturingOutbox) itemsExtracted(t *testing.T) *pb.ItemsExtractedEvent {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	payload, ok := c.events[commonconstants.ItemsExtracted]
	require.True(t, ok, "the run published no ItemsExtracted event")
	event := &pb.ItemsExtractedEvent{}
	require.NoError(t, proto.Unmarshal(payload, event))
	return event
}

func itemComponent(t *testing.T, s *Session, entityID uuid.UUID) *components.ItemComponent {
	t.Helper()
	entity, ok := s.EntityManager.GetEntity(entityID)
	require.True(t, ok, "item entity is gone")
	ic, ok := entity.GetComponent(ecs.ComponentTypeItem)
	require.True(t, ok)
	return ic.(*components.ItemComponent)
}

// A resolved run publishes every delver's worn and carried items, although the
// delvers are sent home, out of the run's world, as it ends. FS-4R9M9 R49,
// I-4R9M9-15.
func TestEndSession_ResolvedRun_PublishesEveryDelversItems(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	outbox := &capturingOutbox{}
	s.sessionCloser = &homeReturner{run: s}
	s.eventEmitter = NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
	s.sender = &recordingSender{}
	s.endSessionCh = make(chan bool, 64)

	// what each delver has on them, read before the run ends
	weapons := map[string]*components.ItemComponent{}
	for _, playerID := range []uuid.UUID{p.carrier, p.fallen} {
		eq, _ := delverEntity(t, s, playerID).GetComponent(ecs.ComponentTypeEquipment)
		weapons[playerID.String()] = itemComponent(t, s, *eq.(*components.EquipmentComponent).WeaponSlot)
	}
	pickedUp := itemComponent(t, s, p.pickedUpItemID)

	// the fallen delver is already down; the carrier escapes and the party resolves
	markEscaped(t, delverEntity(t, s, p.carrier))
	tick(s)
	require.Len(t, s.endSessionCh, 1, "the party has resolved")
	<-s.endSessionCh

	s.endSession()

	event := outbox.itemsExtracted(t)
	require.Len(t, event.PlayerItems, 2, "one entry per delver")

	byMember := map[string]*pb.PlayerItems{}
	for _, items := range event.PlayerItems {
		byMember[items.MemberId] = items
	}
	for memberID, weapon := range weapons {
		items, ok := byMember[memberID]
		require.True(t, ok, "delver %s missing from the extraction", memberID)
		require.NotNil(t, items.Equipment.GetWeapon(), "delver %s's weapon was not extracted", memberID)
		assert.Equal(t, weapon.TemplateID.String(), items.Equipment.Weapon.TemplateId)
		require.NotNil(t, weapon.InstanceID, "a loadout weapon is a brought-in instance")
		assert.Equal(t, weapon.InstanceID.String(), items.Equipment.Weapon.InstanceId)
	}

	satchel := byMember[p.carrier.String()].Inventory
	require.Len(t, satchel, 1, "the carrier's satchel was not extracted")
	assert.Equal(t, pickedUp.TemplateID.String(), satchel[0].TemplateId)
	assert.Equal(t, pickedUp.Name, satchel[0].Name)
	assert.Empty(t, satchel[0].InstanceId, "an item found in the run is new")
	assert.Empty(t, byMember[p.fallen.String()].Inventory)
}

// wrote reports whether any row was written under routingKey.
func (c *capturingOutbox) wrote(routingKey string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, ok := c.events[routingKey]
	return ok
}

// everyItemsExtracted is every items.extracted written, in write order.
func (c *capturingOutbox) everyItemsExtracted(t *testing.T) []*pb.ItemsExtractedEvent {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	events := make([]*pb.ItemsExtractedEvent, 0, len(c.all[commonconstants.ItemsExtracted]))
	for _, payload := range c.all[commonconstants.ItemsExtracted] {
		event := &pb.ItemsExtractedEvent{}
		require.NoError(t, proto.Unmarshal(payload, event))
		events = append(events, event)
	}
	return events
}

// everyMatchEnded is every match.ended written, in write order.
func (c *capturingOutbox) everyMatchEnded(t *testing.T) []*pb.MatchEndedEvent {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	events := make([]*pb.MatchEndedEvent, 0, len(c.all[commonconstants.GameMatchEnded]))
	for _, payload := range c.all[commonconstants.GameMatchEnded] {
		event := &pb.MatchEndedEvent{}
		require.NoError(t, proto.Unmarshal(payload, event))
		events = append(events, event)
	}
	return events
}

// drainSettlements waits for the session's settlement writes to land.
func drainSettlements(t *testing.T, s *Session) {
	t.Helper()
	svc, ok := s.eventEmitter.(*service)
	require.True(t, ok, "the session publishes through the real service")
	svc.Drain()
}
