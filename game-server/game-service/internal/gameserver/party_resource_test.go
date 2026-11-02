package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// FS-CH21F §Requirements R1–R3, R5–R7. I-CH21F-1.
//
// The hub's, a field's and a run's serializer are handed the party membership at
// wiring: once a party forms on the pod's registry, the next frame of whatever
// world its members stand in carries each teammate's resource, and a stranger's
// frame entry stays bare.

const partyFrameSettle = 3 * time.Second

// awaitTeammateResource waits until the recipient's latest frame from world
// shows other with a resource (want true) or without one (want false), every
// non-member bare throughout.
func awaitTeammateResource(t *testing.T, inbox *startSoloInbox, worldID, other uuid.UUID, want bool, strangers ...uuid.UUID) {
	t.Helper()

	deadline := time.Now().Add(partyFrameSettle)
	for time.Now().Before(deadline) {
		if frame := inbox.latestFrame(worldID); frame != nil {
			got, listed := false, false
			for _, o := range frame.OtherPlayers {
				for _, stranger := range strangers {
					require.Falsef(t, o.ID == stranger && o.Resource != nil, "a stranger's resource reached the frame")
				}
				if o.ID == other {
					listed, got = true, o.Resource != nil
				}
			}
			if listed && got == want {
				return
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("no frame from world %s showed %s's resource=%v within %s", worldID, other, want, partyFrameSettle)
}

func TestPartyFrames_EveryWorld_TeammateCarriesResourceStrangerDoesNot(t *testing.T) {
	tests := []struct {
		name string
		// seat seats a member in the world under test
		seat func(r *partyRig, t *testing.T, name string) (*types.Player, *startSoloInbox, func() uuid.UUID)
		// into moves the seated players there, when the world is built after the party forms
		into func(r *partyRig, t *testing.T, players []*types.Player) uuid.UUID
	}{
		{"hub", nil, nil},
		{"field", func(r *partyRig, t *testing.T, name string) (*types.Player, *startSoloInbox, func() uuid.UUID) {
			p, conn, inbox := r.inMeadows(t, name)
			r.conns[p.ID], r.inboxes[p.ID] = conn, inbox
			return p, inbox, func() uuid.UUID { return r.meadows.ID }
		}, nil},
		{"run", nil, func(r *partyRig, t *testing.T, players []*types.Player) uuid.UUID {
			run := r.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: players})
			return run.ID
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			seat := tt.seat
			if seat == nil {
				seat = func(r *partyRig, t *testing.T, name string) (*types.Player, *startSoloInbox, func() uuid.UUID) {
					p, _, inbox := r.inHubTracked(t, name)
					return p, inbox, func() uuid.UUID { return r.hub.ID }
				}
			}
			wren, wrenInbox, world := seat(rig, t, "Wren")
			kaelen, kaelenInbox, _ := seat(rig, t, "Kaelen")
			ash, _, _ := seat(rig, t, "Ash")

			rig.partied(t, rig.conns[wren.ID], wrenInbox, "Kaelen", rig.conns[kaelen.ID], kaelenInbox)

			worldID := world()
			if tt.into != nil {
				worldID = tt.into(rig, t, []*types.Player{wren, kaelen, ash})
			}

			awaitTeammateResource(t, wrenInbox, worldID, kaelen.ID, true, ash.ID)
			awaitTeammateResource(t, kaelenInbox, worldID, wren.ID, true, ash.ID)

			// leaving the party takes the resource off the next frames
			sendParty(rig.server, rig.conns[kaelen.ID], partyLeaveAction, map[string]interface{}{})
			awaitTeammateResource(t, wrenInbox, worldID, kaelen.ID, false, ash.ID)
		})
	}
}
