package settlement

import (
	"context"
	"errors"
	"testing"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// fakeStartClient stands in for the Temporal client. Only ExecuteWorkflow is used
// by the Starter; the embedded interface panics if anything else is ever called.
type fakeStartClient struct {
	client.Client

	err      error
	calls    int
	gotOpts  client.StartWorkflowOptions
	gotName  any
	gotInput Input
}

func (f *fakeStartClient) ExecuteWorkflow(_ context.Context, opts client.StartWorkflowOptions, workflow any, args ...any) (client.WorkflowRun, error) {
	f.calls++
	f.gotOpts = opts
	f.gotName = workflow
	if len(args) == 1 {
		f.gotInput, _ = args[0].(Input)
	}
	return nil, f.err
}

// FS-NXP1W §Req 1, 5: one workflow per listing, every trigger on the same ID, so
// any mix of expiry, AcceptBid and buyout dedups against one run.
func TestStarter_StartsOneWorkflowPerListingForEveryTrigger(t *testing.T) {
	listingID := uuid.New()

	for _, trigger := range []usecase.TriggerKind{usecase.TriggerExpiry, usecase.TriggerAcceptBid, usecase.TriggerBuyout} {
		t.Run(string(trigger), func(t *testing.T) {
			fake := &fakeStartClient{}

			err := NewStarter(fake).StartSettlement(context.Background(), listingID, trigger)

			require.NoError(t, err)
			require.Equal(t, 1, fake.calls)
			assert.Equal(t, "settlement-"+listingID.String(), fake.gotOpts.ID)
			assert.Equal(t, string(bstemporal.QueueMarketplace), fake.gotOpts.TaskQueue)
			assert.Equal(t, enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE, fake.gotOpts.WorkflowIDReusePolicy)
			assert.Equal(t, WorkflowName, fake.gotName)
			assert.Equal(t, Input{ListingID: listingID, Trigger: trigger}, fake.gotInput)
		})
	}
}

// FS-NXP1W §Req 5: a start that finds the listing already settling or settled is
// success, so the second of two triggers (expiry racing a buyout, say) reports
// success and runs nothing.
func TestStarter_AlreadyStartedIsSuccess(t *testing.T) {
	fake := &fakeStartClient{err: serviceerror.NewWorkflowExecutionAlreadyStarted("already started", "", "")}

	err := NewStarter(fake).StartSettlement(context.Background(), uuid.New(), usecase.TriggerExpiry)

	assert.NoError(t, err)
}

// Any other failure is the caller's to hear: the expiry poller logs it and retries
// next tick; AcceptBid and buyout report it.
func TestStarter_OtherFailuresAreReturned(t *testing.T) {
	boom := errors.New("temporal unreachable")
	fake := &fakeStartClient{err: boom}

	err := NewStarter(fake).StartSettlement(context.Background(), uuid.New(), usecase.TriggerExpiry)

	assert.ErrorIs(t, err, boom)
}
