package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// failingBox is an inbox whose every letter fails to publish, off the caller's goroutine, as the
// publisher reports one.
type failingBox struct{}

func (failingBox) open() bool                             { return true }
func (failingBox) letters() <-chan letter                 { return nil }
func (failingBox) send(_ string, _ letter, failed func()) { go failed() }
func (failingBox) sendConfirmed(_ string, _ letter, _, failed func()) {
	go failed()
}

// An invite letter that could not be published still reaches the loop when the loop is behind:
// its failure waits for room rather than being dropped, so the leader is told delivery_failed
// (I-R82NV-3 review "failure notices dropped under load", carried into I-NCC9J-3).
func TestPartyCourier_FailedInvite_WaitsForTheLoop(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	jobs := newLoopJobs()
	for len(jobs) < cap(jobs) {
		jobs <- func() {}
	}
	courier := newPartyCourier(failingBox{}, nil, jobs, "pod-a", func(partyUpdateLetter) {}, func([]uuid.UUID, map[string]interface{}) {})
	told := make(chan struct{})

	courier.sendInvite(ctx, "pod-b", uuid.New(), map[string]interface{}{}, func() { close(told) })

	// the loop catches up: every job it takes runs, the failure among them
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-told:
			return
		case job := <-jobs:
			job()
		case <-deadline:
			t.Fatal("the failed invite never reached the loop")
		}
	}
}
