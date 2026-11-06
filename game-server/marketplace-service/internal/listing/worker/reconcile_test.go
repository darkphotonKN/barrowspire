package worker

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// One tick runs every pass in order; a pass that fails is logged and the next
// still runs (FS-V7A5S Req 8: the withdraw backstop sits beside the reservation
// sweep and neither can starve the other).
func TestReconcileWorker_AFailingPassDoesNotStopTheOthers(t *testing.T) {
	var ran []string
	pass := func(name string, err error) ReconcilePass {
		return ReconcilePass{Name: name, Run: func(ctx context.Context) error {
			ran = append(ran, name)
			return err
		}}
	}

	w := NewReconcileWorker(
		pass("reservations", errors.New("items unreachable")),
		pass("withdrawals", nil),
	)
	w.tick(context.Background())

	assert.Equal(t, []string{"reservations", "withdrawals"}, ran)
}

// FS-04ZB6 Req 12: the confirmed-without-listing backstop runs on the reconcile
// tick after the stale-reservation pass, and a failed stale pass (items down for
// the stale list, say) does not cost the backstop its turn.
func TestReconcileWorker_Tick_RunsTheStalePassThenTheBackstopEvenWhenTheFirstFails(t *testing.T) {
	var ran []string
	pass := func(name string, err error) ReconcilePass {
		return ReconcilePass{Name: name, Run: func(ctx context.Context) error {
			ran = append(ran, name)
			return err
		}}
	}

	w := NewReconcileWorker(
		pass("stale", errors.New("items down")),
		pass("backstop", nil),
	)

	w.tick(context.Background())

	assert.Equal(t, []string{"stale", "backstop"}, ran)
}

// Each pass runs under its own deadline, so a pass stuck on a slow dependency
// cannot hold the next one, or the next tick, behind it.
func TestReconcileWorker_EachPassHasItsOwnDeadline(t *testing.T) {
	var deadlines []time.Duration
	pass := ReconcilePass{Name: "p", Run: func(ctx context.Context) error {
		d, ok := ctx.Deadline()
		require.True(t, ok, "a pass runs under a deadline")
		deadlines = append(deadlines, time.Until(d))
		return nil
	}}

	NewReconcileWorker(pass, pass).tick(context.Background())

	require.Len(t, deadlines, 2)
	for _, left := range deadlines {
		assert.LessOrEqual(t, left, reconcilePassTimeout)
		assert.Greater(t, left, time.Duration(0))
	}
	assert.Less(t, reconcilePassTimeout, reconcileReservationsInterval, "a pass ends before the next tick")
}

// A pass that overruns its deadline is cut off and the next pass still runs.
func TestReconcileWorker_AnOverrunningPassIsCutOff(t *testing.T) {
	var secondRan bool
	hung := ReconcilePass{Name: "hung", Run: func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	}}
	next := ReconcilePass{Name: "next", Run: func(ctx context.Context) error {
		secondRan = true
		return ctx.Err()
	}}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	w := NewReconcileWorker(hung, next)
	w.passTimeout = 10 * time.Millisecond
	w.tick(ctx)

	assert.True(t, secondRan)
}
