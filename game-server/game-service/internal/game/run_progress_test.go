package game

import (
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func (c *capturingOutbox) matchEnded(t *testing.T) *pb.MatchEndedEvent {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	payload, ok := c.events[commonconstants.GameMatchEnded]
	require.True(t, ok, "the run published no match.ended event")
	event := &pb.MatchEndedEvent{}
	require.NoError(t, proto.Unmarshal(payload, event))
	return event
}

// progressKeeper is a host that records what the run tells it as it ends, and
// in which order, then sends the delvers home the way the server does.
type progressKeeper struct {
	homeReturner
	mu       sync.Mutex
	calls    []string
	progress []types.RunProgress
}

func (p *progressKeeper) ApplyRunProgress(progress []types.RunProgress) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, "progress")
	p.progress = progress
}

func (p *progressKeeper) ReturnPlayersToHub(id uuid.UUID) {
	p.mu.Lock()
	p.calls = append(p.calls, "home")
	p.mu.Unlock()
	p.homeReturner.ReturnPlayersToHub(id)
}

// endableRun is a run whose end can be driven by hand: its host records the
// run's progress and its publish lands in an outbox the test reads.
func endableRun(t *testing.T) (*Session, *progressKeeper, *capturingOutbox) {
	t.Helper()
	s := unstartedRun(t)
	keeper := &progressKeeper{homeReturner: homeReturner{run: s}}
	outbox := &capturingOutbox{}
	s.sessionCloser = keeper
	s.eventEmitter = NewService(outbox)
	s.sender = &recordingSender{}
	s.endSessionCh = make(chan bool, 64)
	return s, keeper, outbox
}

// A resolved run's match.ended carries, per member, the character in play and
// the experience it earned there, a member removed before the end included.
// FS-BDA7X §Requirements 22–23.
func TestEndSession_MatchEnded_CarriesEveryCharactersExperience(t *testing.T) {
	s, _, outbox := endableRun(t)
	stayer := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior"})
	leaver := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "mage"})

	s.publishKills([]systems.KillRecord{ghoulKilledBy(stayer.id)})
	s.RemovePlayer(leaver.id.String())
	s.publishKills([]systems.KillRecord{ghoulKilledBy(stayer.id)})
	// seated after every kill, so earned nothing
	late := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Mira", Class: "archer"})

	s.endSession()

	byMember := map[string]*pb.PlayerMatchResult{}
	for _, player := range outbox.matchEnded(t).Players {
		byMember[player.MemberId] = player
	}
	require.Len(t, byMember, 3, "every seated member and the one who left")

	tests := []struct {
		name   string
		m      member
		gained int64
	}{
		{"stayed to the end", stayer, 20},
		{"removed mid-run", leaver, 10},
		{"earned nothing", late, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := byMember[tt.m.id.String()]
			require.True(t, ok, "member missing from match.ended")
			assert.Equal(t, tt.m.body.player.CharacterID.String(), got.CharacterId)
			assert.Equal(t, tt.gained, got.ExperienceGained)
		})
	}
}

// The run's progress reaches the host before its delvers are sent home, so the
// HUB seats them at the run's resulting level: seated members as their bodies
// end the run, removed members by what they earned. FS-BDA7X §Requirements 24.
func TestEndSession_RunProgress_ReachesTheHostBeforeHome(t *testing.T) {
	s, keeper, _ := endableRun(t)
	stayer := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 1, Experience: 90})
	leaver := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "mage", Experience: 5})
	idle := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Mira", Class: "archer"})
	idle.body.player.Escape = true // escaped before any kill: earns nothing

	s.publishKills([]systems.KillRecord{ghoulKilledBy(stayer.id)})
	s.RemovePlayer(leaver.id.String())

	s.endSession()

	assert.Equal(t, []string{"progress", "home"}, keeper.calls)

	byMember := map[uuid.UUID]types.RunProgress{}
	for _, p := range keeper.progress {
		byMember[p.MemberID] = p
	}
	assert.Equal(t, types.RunProgress{
		MemberID: stayer.id, CharacterID: stayer.body.player.CharacterID,
		Gained: 10, Seated: true, Level: 2, Experience: 100,
	}, byMember[stayer.id], "seated: the body's level and experience")
	assert.Equal(t, types.RunProgress{
		MemberID: leaver.id, CharacterID: leaver.body.player.CharacterID, Gained: 10,
	}, byMember[leaver.id], "removed: only what was earned")
	assert.Equal(t, types.RunProgress{
		MemberID: idle.id, CharacterID: idle.body.player.CharacterID,
		Seated: true, Level: 1, Experience: 0,
	}, byMember[idle.id], "nothing earned: where it was seated")
	assert.Len(t, keeper.progress, 3)
}
