package ledger_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/ledger"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// absentAddr is an address nothing listens on: ledger-service is down.
const absentAddr = "127.0.0.1:1"

func newAbsentClient(t *testing.T) *ledger.Client {
	t.Helper()
	c, err := ledger.NewClient(absentAddr)
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// A missing downstream is a runtime failure, never a boot failure — the gateway
// must start with ledger-service absent, exactly as it does for the others.
func TestNewClient_ConstructsWithDownstreamAbsent(t *testing.T) {
	c, err := ledger.NewClient(absentAddr)

	require.NoError(t, err, "construction must not connect; the connection is lazy")
	assert.NoError(t, c.Close())
}

// An absent ledger-service must surface as codes.Unavailable, the status the
// error seam answers 503 for: the request was valid and retrying is correct.
func TestGetTransaction_DownstreamAbsent_IsUnavailable(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := newAbsentClient(t).GetTransaction(ctx, &pb.GetTransactionRequest{})

	require.Error(t, err)
	assert.Equal(t, codes.Unavailable, status.Code(err))
}

func TestListEntries_DownstreamAbsent_IsUnavailable(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := newAbsentClient(t).ListEntries(ctx, &pb.ListEntriesRequest{})

	require.Error(t, err)
	assert.Equal(t, codes.Unavailable, status.Code(err))
}
