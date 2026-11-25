package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
)

/**
* Prometheus game metrics, on the default registry the :8195 /metrics endpoint
* serves. Each pod reports its own; the pod comes from the scrape's pod label,
* never from a label set here.
**/

var (
	// WSConnections is the WebSocket connections this pod is reading from now.
	WSConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "game_ws_connections",
		Help: "Open WebSocket connections on this pod.",
	})

	// DelvesActive is the escape runs this pod hosts now. The hub and the fields
	// are not delves.
	DelvesActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "game_delves_active",
		Help: "Escape runs hosted on this pod.",
	})

	// MatchmakingQueueDepth is the global queue's length as this pod last read
	// it. Every pod reads the same Redis list, so take max() across pods, never
	// sum().
	MatchmakingQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "game_matchmaking_queue_depth",
		Help: "Players in the global matchmaking queue, sampled from Redis once a second.",
	})

	// MatchmakingWaitSeconds is how long a player queued on this pod waited
	// before a match took them off the queue. Leaving the queue is not a wait.
	MatchmakingWaitSeconds = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "game_matchmaking_wait_seconds",
		Help:    "Time from joining the matchmaking queue to being matched.",
		Buckets: []float64{0.5, 1, 2, 5, 10, 30, 60},
	})

	// WSMessages counts WebSocket messages by direction (in, out) and type.
	// Use CountWSMessage, which keeps the type label bounded.
	WSMessages = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "game_ws_messages_total",
		Help: "WebSocket messages by direction and type.",
	}, []string{"direction", "type"})
)

const (
	DirectionIn  = "in"
	DirectionOut = "out"

	// TypeState is the per-tick world state, which carries no action.
	TypeState = "state"
	// TypeMalformed is an inbound frame that is not a JSON message.
	TypeMalformed = "malformed"
	// TypeOther is any action outside the known set: a client can send any
	// string, and each one must not mint a new series.
	TypeOther = "other"
)

// CountWSMessage counts one message. action is the message's action; one the
// game does not know is counted as TypeOther.
func CountWSMessage(direction, action string) {
	WSMessages.WithLabelValues(direction, wsType(action)).Inc()
}

func wsType(action string) string {
	switch action {
	case TypeState, TypeMalformed:
		return action
	}
	if _, ok := knownActions[action]; ok {
		return action
	}
	return TypeOther
}

// knownActions is every constants.Action, plus the few actions the hub sends
// as literals. TestKnownActionsCoverConstants fails when a new constant is
// missing here.
var knownActions = map[string]struct{}{
	"queue_status": {},
	// ActionHandoffConnect is left out: it is "end_game", the same as ActionEndGame
	string(constants.ActionQueue):              {},
	string(constants.ActionFindGame):           {},
	string(constants.ActionLeaveQueue):         {},
	string(constants.ActionLeaveGame):          {},
	string(constants.ActionStartSolo):          {},
	string(constants.ActionStartDevEndgameRun): {},
	string(constants.ActionLeaveRun):           {},
	string(constants.ActionForfeitRun):         {},
	string(constants.ActionDrinkPotion):        {},
	string(constants.ActionSpendPassivePoint):  {},
	string(constants.ActionLeaveHub):           {},
	string(constants.ActionWorldLeft):          {},
	string(constants.ActionRenewToken):         {},
	string(constants.ActionTokenRenewed):       {},
	string(constants.ActionEnterField):         {},
	string(constants.ActionLeaveField):         {},
	string(constants.ActionEnterHub):           {},
	string(constants.ActionMove):               {},
	string(constants.ActionInteract):           {},
	string(constants.ActionAttack):             {},
	string(constants.ActionPickup):             {},
	string(constants.ActionUseItem):            {},
	string(constants.ActionDropItem):           {},
	string(constants.ActionEquip):              {},
	string(constants.ActionUnequip):            {},
	string(constants.ActionCastSkill):          {},
	string(constants.ActionBuy):                {},
	string(constants.ActionChat):               {},
	string(constants.ActionChatNotice):         {},
	string(constants.ActionPartyInvite):        {},
	string(constants.ActionPartyNotice):        {},
	string(constants.ActionPartyAccept):        {},
	string(constants.ActionPartyUpdate):        {},
	string(constants.ActionPartyDecline):       {},
	string(constants.ActionPartyLeave):         {},
	string(constants.ActionPartyCreate):        {},
	string(constants.ActionPartyKick):          {},
	string(constants.ActionPartyTransfer):      {},
	string(constants.ActionPartyTravel):        {},
	string(constants.ActionPartyEnter):         {},
	string(constants.ActionPartyReady):         {},
	string(constants.ActionPartyReadyCheck):    {},
	string(constants.ActionError):              {},
	string(constants.ActionSuccess):            {},
	string(constants.ActionEndGame):            {},
	string(constants.ActionSettlement):         {},
	string(constants.ActionReconnect):          {},
	string(constants.ActionWorldEntered):       {},
	string(constants.ActionFloorMap):           {},
	string(constants.ActionRequestFloorMap):    {},
	string(constants.ActionWorldHandoff):       {},
	string(constants.ActionMailArrived):        {},
}
