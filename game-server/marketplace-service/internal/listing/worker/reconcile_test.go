package worker

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

type recordingPass struct {
	name string
	err  error
	ran  *[]string
}

func (p recordingPass) Handle(ctx context.Context) error {
	*p.ran = append(*p.ran, p.name)
	return p.err
}

// FS-04ZB6 Req 12: the confirmed-without-listing backstop runs on the reconcile
// tick after the stale-reservation pass, and a failed stale pass (items down for
// the stale list, say) does not cost the backstop its turn.
func TestReconcileWorker_Tick_RunsTheStalePassThenTheBackstopEvenWhenTheFirstFails(t *testing.T) {
	var ran []string
	w := NewReconcileWorker(
		recordingPass{name: "stale", err: errors.New("items down"), ran: &ran},
		recordingPass{name: "backstop", ran: &ran},
	)

	w.tick(context.Background())

	assert.Equal(t, []string{"stale", "backstop"}, ran)
}
