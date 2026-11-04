package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The mail-arrival relay (FS-1GZGD A4, R42–R44; ADR-0045): notification-service publishes on the
* Redis channel `mail:arrived` when a mailbox letter is stored, and every pod passes it on as
* `mail_arrived` to its players standing in the HUB world. A hint only: the client then asks the
* gateway for its mailbox summary. game-service never reads or stores a mailbox letter.
*
* World chat's shape: one subscriber goroutine that subscribes again a second after a drop, a
* bounded queue into the message hub's loop, and delivery on that loop. At most once: a full queue
* drops the arrival rather than stall the subscriber, and nothing is stored or retried.
**/

// mailArrivedChannel is the Redis pub/sub channel notification-service publishes a mail arrival
// on. The channel and its two payload forms are the contract between the two services (ADR-0045).
const mailArrivedChannel = "mail:arrived"

const (
	// how many arrivals off the bus may wait for the hub's loop before one is dropped
	mailArrivalBuffer = 64
	// how long the subscriber waits after its subscription drops before subscribing again
	mailArrivalResubscribeWait = time.Second
)

// mailArrivalBus is the Redis subscription the relay listens on: chatbus.Redis in production.
type mailArrivalBus interface {
	Listen(ctx context.Context, channel string, onMessage func(payload []byte)) error
}

// mailArrivalAudience is who stands in the HUB world on this pod, with the connection each is
// seated on: read off the connection table routing trusts (Server.TownConns).
type mailArrivalAudience interface {
	TownConns() map[uuid.UUID]*websocket.Conn
}

// mailArrivalSender is how mail_arrived reaches one connection.
type mailArrivalSender interface {
	SendMessageToConn(conn *websocket.Conn, msg types.Message) error
}

// mailArrival is one decoded message off `mail:arrived`: for one member, or for everyone.
type mailArrival struct {
	memberID  uuid.UUID
	broadcast bool
}

type mailArrivals struct {
	bus      mailArrivalBus
	audience mailArrivalAudience
	sender   mailArrivalSender
	// arrivals off the bus, waiting for the hub's loop to deliver them
	arrivals chan mailArrival
}

// newMailArrivals builds the pod's relay. With no bus it starts nothing and its queue stays empty.
func newMailArrivals(bus mailArrivalBus, audience mailArrivalAudience, sender mailArrivalSender) *mailArrivals {
	return &mailArrivals{
		bus:      bus,
		audience: audience,
		sender:   sender,
		arrivals: make(chan mailArrival, mailArrivalBuffer),
	}
}

// start runs the subscriber for the life of ctx; a relay with no bus starts nothing.
func (m *mailArrivals) start(ctx context.Context) {
	if m.bus == nil {
		return
	}
	go m.listen(ctx)
}

// inbound is where arrivals off the bus wait for the hub's loop.
func (m *mailArrivals) inbound() <-chan mailArrival {
	return m.arrivals
}

// listen keeps a subscription to `mail:arrived` open for the life of ctx, subscribing again a
// moment after it drops (R42). Runs on its own goroutine.
func (m *mailArrivals) listen(ctx context.Context) {
	for {
		err := m.bus.Listen(ctx, mailArrivedChannel, m.arrived)
		if ctx.Err() != nil {
			return
		}
		slog.Warn("mail arrival subscription dropped; subscribing again", "redis_channel", mailArrivedChannel, "error", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(mailArrivalResubscribeWait):
		}
	}
}

// arrived takes one message's bytes off the bus: a mail arrival goes to the hub's loop, anything
// else is skipped with a warning. A full queue drops the arrival rather than stall the subscriber.
func (m *mailArrivals) arrived(raw []byte) {
	arrival, err := decodeMailArrival(raw)
	if err != nil {
		slog.Warn("mail arrival skipped", "redis_channel", mailArrivedChannel, "error", err)
		return
	}
	select {
	case m.arrivals <- arrival:
	default:
		slog.Warn("mail arrival dropped: hub loop behind", "redis_channel", mailArrivedChannel)
	}
}

var errNotAMailArrival = errors.New("not a mail arrival")

// decodeMailArrival reads `{"member_id": "<uuid>"}` or `{"broadcast": true}`. Both, neither, a
// broadcast that is not true, a member id that is not a uuid, and anything not a JSON object are
// refused. Other keys are ignored.
func decodeMailArrival(raw []byte) (mailArrival, error) {
	var wire struct {
		MemberID  *string `json:"member_id"`
		Broadcast *bool   `json:"broadcast"`
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		return mailArrival{}, fmt.Errorf("decode mail arrival: %w", err)
	}
	switch {
	case wire.MemberID != nil && wire.Broadcast != nil:
		return mailArrival{}, fmt.Errorf("decode mail arrival: %w: both member_id and broadcast", errNotAMailArrival)
	case wire.Broadcast != nil:
		if !*wire.Broadcast {
			return mailArrival{}, fmt.Errorf("decode mail arrival: %w: broadcast is not true", errNotAMailArrival)
		}
		return mailArrival{broadcast: true}, nil
	case wire.MemberID != nil:
		memberID, err := uuid.Parse(*wire.MemberID)
		if err != nil || memberID == uuid.Nil {
			return mailArrival{}, fmt.Errorf("decode mail arrival: %w: member_id is not a member id", errNotAMailArrival)
		}
		return mailArrival{memberID: memberID}, nil
	default:
		return mailArrival{}, fmt.Errorf("decode mail arrival: %w: neither member_id nor broadcast", errNotAMailArrival)
	}
}

// deliver sends mail_arrived, on the hub's loop, to the named member if they stand in the HUB
// world on this pod, or to every player there for a broadcast (R43). A player in a run, a field
// or no world, or not on this pod, gets nothing; a full writer queue skips only that player.
func (m *mailArrivals) deliver(arrival mailArrival) {
	town := m.audience.TownConns()
	if arrival.broadcast {
		for playerID, conn := range town {
			m.send(playerID, conn)
		}
		return
	}
	if conn, here := town[arrival.memberID]; here {
		m.send(arrival.memberID, conn)
	}
}

func (m *mailArrivals) send(playerID uuid.UUID, conn *websocket.Conn) {
	if err := m.sender.SendMessageToConn(conn, mailArrivedMessage()); err != nil {
		slog.Debug("mail_arrived not delivered", "player_id", playerID, "error", err)
	}
}

// mailArrivedMessage is `{"action": "mail_arrived", "payload": {}}`: an empty object, never null,
// and no letter content (R43).
func mailArrivedMessage() types.Message {
	return types.Message{Action: string(constants.ActionMailArrived), Payload: map[string]interface{}{}}
}

// WithMailArrivals gives the pod the `mail:arrived` subscription on bus, the chat bus's Redis in
// production: it subscribes at boot and passes each arrival on to its HUB-world players.
// FS-1GZGD R42, ADR-0045.
func WithMailArrivals(bus mailArrivalBus) Option {
	return func(o *bootOptions) { o.mailBus = bus }
}
