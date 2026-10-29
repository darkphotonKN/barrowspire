package gameserver

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// FS-X2F2H §F R38–R42, R49; §B R16; Acceptance Criteria 9–11; Edge States
// "Leave races", "Disconnect while fallen". I-X2F2H-6.
//
// The rig settles through the real game service, writing to an outbox that
// keeps every row, so a test reads exactly what the relay would carry.

// outboxRows keeps every row the match-end write records, in order, with the
// transaction it was written in.
type outboxRows struct {
	mu   sync.Mutex
	rows []outboxRow
}

type outboxRow struct {
	tx     *sqlx.Tx
	params commonoutbox.OutboxParams
}

func (o *outboxRows) CreateOutboxTx(_ context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error {
	o.mu.Lock()
	defer o.mu.Unlock()

	o.rows = append(o.rows, outboxRow{tx: tx, params: params})
	return nil
}

func (o *outboxRows) all() []outboxRow {
	o.mu.Lock()
	defer o.mu.Unlock()

	return append([]outboxRow(nil), o.rows...)
}

// settledPair is one visit's two rows, decoded, after checking they are
// exactly one items.extracted then one match.ended in one transaction.
func settledPair(t *testing.T, rows []outboxRow) (*pb.ItemsExtractedEvent, *pb.MatchEndedEvent) {
	t.Helper()

	require.Len(t, rows, 2, "one visit settles as exactly two rows")
	assert.Equal(t, commonconstants.ItemsExtracted, rows[0].params.RoutingKey)
	assert.Equal(t, commonconstants.GameMatchEnded, rows[1].params.RoutingKey)
	assert.Same(t, rows[0].tx, rows[1].tx, "both rows in one transaction")

	extracted := &pb.ItemsExtractedEvent{}
	require.NoError(t, proto.Unmarshal(rows[0].params.Payload, extracted))
	ended := &pb.MatchEndedEvent{}
	require.NoError(t, proto.Unmarshal(rows[1].params.Payload, ended))
	return extracted, ended
}

// committingDB lets enough transactions begin and commit for one test's visits.
func committingDB(t *testing.T) game.TxBeginner {
	t.Helper()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	mock.MatchExpectationsInOrder(false)
	for range 8 {
		mock.ExpectBegin()
		mock.ExpectCommit()
	}
	return sqlx.NewDb(db, "postgres")
}

// meadowsSword is the stored instance of the sword meadowsLoadout equips.
var meadowsSword = uuid.New()

// meadowsLoadout is what items-service says Wren has equipped: a sword she
// can wear.
func meadowsLoadout() *loadoutItems {
	return &loadoutItems{loadout: &itemspb.GetLoadoutWithItemsResponse{
		Weapon: &itemspb.ItemInstance{Id: meadowsSword.String(), TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Seax", RequiredLevel: 1},
	}}
}

// newSettlingRig is a field rig whose visits settle to an outbox.
func newSettlingRig(t *testing.T) (*fieldRig, *outboxRows) {
	t.Helper()

	rig := newFieldRig(t, meadowsLoadout())
	outbox := &outboxRows{}
	rig.server.visitSettler = game.NewService(committingDB(t), outbox)
	return rig, outbox
}

// A server is built settling visits through the publisher it is handed, and
// through the log alone without one. R39.
func TestNewServer_SettlesVisitsThroughTheGivenPublisher(t *testing.T) {
	publisher := game.NewService(committingDB(t), &outboxRows{})

	assert.Same(t, publisher, bootedServer(t, WithVisitSettler(publisher)).visitSettler)
	assert.Equal(t, logVisitSettler{}, bootedServer(t).visitSettler)
}

// leave_field writes one items.extracted and one match.ended, in one
// transaction, under the visit's own id: the returned result, in a field.
// R39–R41, R43; AC 9.
func TestLeaveField_SettlesThroughTheOutbox(t *testing.T) {
	rig, outbox := newSettlingRig(t)
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.enterMeadows(t, wren, conn, inbox)
	rig.walkToEntrance(t, wren, conn)

	sendAction(rig.server, conn, constants.ActionLeaveField)
	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionLeaveField))
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))

	extracted, ended := settledPair(t, outbox.all())

	assert.Equal(t, commonconstants.WorldTypeField, ended.GetWorldType())
	visitID := ended.GetSessionId()
	assert.NotEqual(t, rig.meadows.ID.String(), visitID, "the visit's own id, never the channel's")
	assert.Equal(t, visitID, extracted.GetSessionId())
	require.Len(t, ended.GetPlayers(), 1)
	result := ended.GetPlayers()[0]
	assert.Equal(t, wren.ID.String(), result.GetMemberId())
	assert.Equal(t, wren.Character.ID.String(), result.GetCharacterId())
	assert.NotEmpty(t, result.GetUsername())
	assert.False(t, result.GetWin())
	assert.False(t, result.GetEscape())
	assert.Equal(t, int32(1), result.GetFinalPosition())
	assert.Zero(t, result.GetExperienceGained(), "no kills, no experience")
	assert.False(t, ended.GetMatchEndedAt().AsTime().Before(ended.GetMatchStartedAt().AsTime()))

	require.Len(t, extracted.GetPlayerItems(), 1)
	items := extracted.GetPlayerItems()[0]
	assert.Equal(t, wren.ID.String(), items.GetMemberId())
	require.NotNil(t, items.GetEquipment(), "equipment is never nil")
	assert.Equal(t, meadowsSword.String(), items.GetEquipment().GetWeapon().GetInstanceId(), "the worn sword, as stored")
}

// Every other way out of a field writes the same pair, once. R17–R19, R49;
// AC 10.
func TestLeavingAFieldAnyWay_SettlesOnePair(t *testing.T) {
	tests := []struct {
		name  string
		leave func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, inbox *startSoloInbox)
	}{
		{
			name: "disconnect",
			leave: func(t *testing.T, rig *fieldRig, _ *types.Player, conn *websocket.Conn, _ *startSoloInbox) {
				rig.server.handleReadError(conn, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})
			},
		},
		{
			name: "leave_hub",
			leave: func(t *testing.T, rig *fieldRig, _ *types.Player, conn *websocket.Conn, inbox *startSoloInbox) {
				sendAction(rig.server, conn, constants.ActionLeaveHub)
				_, answered := inbox.await(string(constants.ActionWorldLeft), string(constants.ActionLeaveHub))
				require.True(t, answered)
			},
		},
		{
			name: "enter_hub",
			leave: func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, inbox *startSoloInbox) {
				sendEnterHub(rig.server, conn, map[string]interface{}{"characterId": wren.Character.ID.String()})
				_, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterHub))
				require.True(t, answered)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig, outbox := newSettlingRig(t)
			serverSide, _ := wsPair(t)
			wren, conn, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)
			rig.enterMeadows(t, wren, conn, inbox)

			tt.leave(t, rig, wren, conn, inbox)

			_, ended := settledPair(t, outbox.all())
			assert.Equal(t, commonconstants.WorldTypeField, ended.GetWorldType())
			assert.Equal(t, wren.ID.String(), ended.GetPlayers()[0].GetMemberId())
		})
	}
}

// A leave racing a disconnect writes one pair, never two. R49; AC 10 (-race).
func TestLeaveField_RacingADisconnect_WritesOnePair(t *testing.T) {
	for range 5 {
		rig, outbox := newSettlingRig(t)
		serverSide, _ := wsPair(t)
		wren, _, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)
		rig.enterMeadows(t, wren, serverSide, inbox)
		rig.walkToEntrance(t, wren, serverSide)

		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			sendAction(rig.server, serverSide, constants.ActionLeaveField)
		}()
		go func() {
			defer wg.Done()
			rig.server.handleReadError(serverSide, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})
		}()
		wg.Wait()

		require.Eventually(t, func() bool {
			return !rig.meadows.HasPlayer(wren.ID) && len(outbox.all()) >= 2
		}, startSoloSettle, 10*time.Millisecond, "the visit never settled")
		// the message hub may still be finishing the leave
		time.Sleep(50 * time.Millisecond)

		settledPair(t, outbox.all())
	}
}

// Two visits by one character settle under two ids, so character-service
// grants both. R42; AC 11.
func TestTwoVisits_SettleUnderTwoIDs(t *testing.T) {
	rig, outbox := newSettlingRig(t)
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")

	for range 2 {
		rig.enterMeadows(t, wren, conn, inbox)
		rig.walkToEntrance(t, wren, conn)
		sendAction(rig.server, conn, constants.ActionLeaveField)
		_, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionLeaveField))
		require.True(t, answered)

		// home at the gate's arrival point: set back down on the gate
		rig.hub.RemovePlayer(wren.ID.String())
		rig.hub.AddPlayerAt(wren.ID, recordOf(t, rig.server, wren.ID).Character, "", 1960, 360)
	}

	rows := outbox.all()
	require.Len(t, rows, 4, "two visits, two pairs")
	_, first := settledPair(t, rows[:2])
	_, second := settledPair(t, rows[2:])
	assert.NotEqual(t, first.GetSessionId(), second.GetSessionId())
}

// The hub seats a returning player at the level the visit left them, before
// character-service has heard of it. R16; AC 11.
func TestComingHome_TheHubShowsTheNewLevel(t *testing.T) {
	rig, _ := newSettlingRig(t)
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.enterMeadows(t, wren, conn, inbox)

	visit, ended := rig.meadows.EndVisit(wren.ID)
	require.True(t, ended)
	visit.Level, visit.Experience = 6, 2600

	_, err := rig.server.comeHome(context.Background(), rig.meadows, visit)
	require.NoError(t, err)

	body := bodyIn(rig.hub, wren.ID)
	require.NotNil(t, body)
	sc, ok := body.GetComponent(ecs.ComponentTypeStats)
	require.True(t, ok)
	assert.Equal(t, 6, sc.(*components.StatsComponent).Level, "the hub body is at the new level")
	assert.Equal(t, 6, recordOf(t, rig.server, wren.ID).Character.Level)
	assert.Equal(t, int64(2600), recordOf(t, rig.server, wren.ID).Character.Experience)
}

// A loadout read that comes back with nothing is refused as unreadable: a bare
// body would settle as an empty loadout and clear every stored slot. R10, D27.
func TestEnterField_NoLoadout_RefusedAsUnreadable(t *testing.T) {
	rig := newFieldRig(t, &loadoutItems{loadout: nil})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.awaitAtMeadowsGate(t, wren)

	sendEnterField(rig.server, conn, meadowsField)

	assertRefused(t, inbox, constants.ActionEnterField, "loadout_unavailable")
	assert.False(t, rig.meadows.HasPlayer(wren.ID))
	assert.True(t, rig.hub.HasPlayer(wren.ID), "still in the hub")
}
