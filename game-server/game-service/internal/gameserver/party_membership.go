package gameserver

import (
	"maps"
	"sync/atomic"

	"github.com/google/uuid"
)

/**
* The party membership (FS-CH21F R5, R6): who is in which party, as this pod's party cache last held
* it, for every world's serializer to read. The cache is the hub loop's alone (ADR-0037), while
* each world serializes on its own goroutine, so the cache publishes a fresh map after every
* change and never writes one it has published: a reader takes the pointer and reads without a
* lock, and one broadcast reads it once for all its recipients.
**/
type partyMembership struct {
	current atomic.Pointer[map[uuid.UUID]uuid.UUID]
}

func newPartyMembership() *partyMembership { return &partyMembership{} }

// Snapshot is the last published player → party map; empty before the first change, and on a pod
// built without one. Nobody may write it.
func (r *partyMembership) Snapshot() map[uuid.UUID]uuid.UUID {
	if r == nil {
		return nil
	}
	if m := r.current.Load(); m != nil {
		return *m
	}
	return nil
}

// publish replaces the snapshot with a copy of memberOf, which the caller goes on writing. Only
// the hub's loop publishes.
func (r *partyMembership) publish(memberOf map[uuid.UUID]uuid.UUID) {
	if r == nil {
		return
	}
	next := maps.Clone(memberOf)
	r.current.Store(&next)
}
