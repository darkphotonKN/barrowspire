package gameserver

import (
	"maps"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-CH21F §Requirements R5–R7. I-CH21F-1.
//
// The party membership is the cache's player → party map, published copy-on-write
// for every world's serializer to read off the hub's loop.

func partyOf(ids ...uuid.UUID) partystore.Party {
	p := partystore.Party{ID: uuid.New(), Version: 1}
	for _, id := range ids {
		p.Members = append(p.Members, partystore.Member{PlayerID: id})
	}
	return p
}

// newMembershipCache is a party cache over no store, publishing to membership: put and
// drop are all a test drives.
func newMembershipCache(membership *partyMembership) *partyCache {
	return newPartyCache(nil, nil, nil, time.Now, membership, nil, nil)
}

// Before the first change the snapshot is empty: no one is in a party.
// FS-CH21F Edge States "Snapshot not yet published at boot".
func TestPartyMembership_BeforeFirstChange_Empty(t *testing.T) {
	assert.Empty(t, newPartyMembership().Snapshot())

	var unwired *partyMembership
	assert.Empty(t, unwired.Snapshot(), "a pod built without one reads as no party")
}

// Every change to the cache publishes a new snapshot of who is in which party,
// remote members included; a snapshot already handed out never changes.
// FS-CH21F R5.
func TestPartyCache_EveryChange_PublishesNewSnapshot(t *testing.T) {
	wren, kaelen, ash, remote := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	tests := []struct {
		name   string
		change func(c *partyCache, p partystore.Party)
		want   func(p partystore.Party) map[uuid.UUID]uuid.UUID
	}{
		{"a put: a new party's members, a remote one too",
			func(c *partyCache, p partystore.Party) {},
			func(p partystore.Party) map[uuid.UUID]uuid.UUID {
				return map[uuid.UUID]uuid.UUID{wren: p.ID, kaelen: p.ID, remote: p.ID}
			}},
		{"a newer version: one member left, another joined",
			func(c *partyCache, p partystore.Party) {
				next := partyOf(wren, ash)
				next.ID, next.Version = p.ID, p.Version+1
				require.True(t, c.put(next))
			},
			func(p partystore.Party) map[uuid.UUID]uuid.UUID {
				return map[uuid.UUID]uuid.UUID{wren: p.ID, ash: p.ID}
			}},
		{"a drop: the party ended or none of it is here",
			func(c *partyCache, p partystore.Party) { c.drop(p.ID) },
			func(partystore.Party) map[uuid.UUID]uuid.UUID { return map[uuid.UUID]uuid.UUID{} }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			membership := newPartyMembership()
			c := newMembershipCache(membership)
			p := partyOf(wren, kaelen, remote)
			require.True(t, c.put(p))
			first := membership.Snapshot()
			firstCopy := maps.Clone(first)

			tt.change(c, p)

			assert.Equal(t, tt.want(p), membership.Snapshot())
			assert.Equal(t, firstCopy, first, "a published snapshot is never written")
		})
	}
}

// A put the cache refuses, an older version arriving late, changes nothing and
// publishes nothing new. FS-CH21F R5.
func TestPartyCache_StalePut_KeepsSnapshot(t *testing.T) {
	membership := newPartyMembership()
	c := newMembershipCache(membership)
	p := partyOf(uuid.New(), uuid.New())
	p.Version = 3
	require.True(t, c.put(p))
	before := membership.Snapshot()

	stale := partyOf(uuid.New())
	stale.ID, stale.Version = p.ID, 2
	require.False(t, c.put(stale))

	assert.Equal(t, before, membership.Snapshot())
}

// A reader on another goroutine, as each world's serializer is, sees only
// whole snapshots while the hub's loop keeps publishing: every snapshot holds
// both members of the one party, or neither. Run with -race. FS-CH21F R5, R6.
func TestPartyMembership_ConcurrentReader_SeesWholeSnapshots(t *testing.T) {
	membership := newPartyMembership()
	c := newMembershipCache(membership)
	wren, kaelen := uuid.New(), uuid.New()

	stop := make(chan struct{})
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				snap := membership.Snapshot()
				w, wIn := snap[wren]
				k, kIn := snap[kaelen]
				if wIn != kIn || w != k {
					t.Errorf("a torn snapshot: %v", snap)
					return
				}
			}
		}()
	}

	for range 500 {
		p := partyOf(wren, kaelen)
		c.put(p)
		c.drop(p.ID)
	}
	close(stop)
	wg.Wait()
}
