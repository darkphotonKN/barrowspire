package withdrawlisting

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
)

// fakeClient stands in for the Temporal client. Only ExecuteWorkflow is used by the
// Starter; the embedded interface panics if anything else is ever called.
type fakeClient struct {
	client.Client

	err      error
	calls    int
	gotOpts  client.StartWorkflowOptions
	gotName  any
	gotInput Input
}

func (f *fakeClient) ExecuteWorkflow(_ context.Context, opts client.StartWorkflowOptions, workflow any, args ...any) (client.WorkflowRun, error) {
	f.calls++
	f.gotOpts = opts
	f.gotName = workflow
	if len(args) == 1 {
		f.gotInput, _ = args[0].(Input)
	}
	return nil, f.err
}

// One withdrawal per listing: every start for the same listing lands on the same run.
func TestWorkflowID_IsKeyedByListing(t *testing.T) {
	listingID := uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

	assert.Equal(t, "withdraw-listing-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", WorkflowID(listingID))
}

func TestStarter_StartsTheWithdrawalOnTheMarketplaceQueue(t *testing.T) {
	listingID, itemID := uuid.New(), uuid.New()
	bidIDs := []uuid.UUID{uuid.New(), uuid.New()}
	fake := &fakeClient{}

	err := NewStarter(fake).StartListingWithdrawal(context.Background(), listingID, itemID, bidIDs)

	require.NoError(t, err)
	require.Equal(t, 1, fake.calls)
	assert.Equal(t, WorkflowID(listingID), fake.gotOpts.ID)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), fake.gotOpts.TaskQueue, "marketplace hosts the workflow")
	assert.Equal(t, enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE, fake.gotOpts.WorkflowIDReusePolicy)
	assert.Equal(t, WorkflowName, fake.gotName)
	assert.Equal(t, Input{ListingID: listingID, ItemID: itemID, BidIDs: bidIDs}, fake.gotInput)
}

func TestStarter_StartError(t *testing.T) {
	unavailable := serviceerror.NewUnavailable("temporal down")

	tests := []struct {
		name    string
		err     error
		wantErr error
	}{
		{
			// a closed run under REJECT_DUPLICATE: this listing's withdrawal is
			// already being or has been carried out
			name:    "already started is success",
			err:     serviceerror.NewWorkflowExecutionAlreadyStarted("already started", "", ""),
			wantErr: nil,
		},
		{
			name:    "any other failure is returned",
			err:     unavailable,
			wantErr: unavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeClient{err: tt.err}

			err := NewStarter(fake).StartListingWithdrawal(context.Background(), uuid.New(), uuid.New(), nil)

			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.True(t, errors.Is(err, tt.wantErr), "the cause stays reachable for the caller's log")
		})
	}
}
