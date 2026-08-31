package ledger_test

import (
	"context"
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/ledger"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubRegistry records what the client asked Consul to discover, and refuses to
// resolve it. Refusing is the point: this slice proves the client dials the
// right service name through the shared discovery path, not that ledger-service
// is up.
type stubRegistry struct {
	asked []string
	err   error
}

func (s *stubRegistry) Register(ctx context.Context, instanceID, serviceName, hostPort string) error {
	return nil
}
func (s *stubRegistry) Deregister(ctx context.Context, instanceID, serviceName string) error {
	return nil
}
func (s *stubRegistry) HealthCheck(instanceID, serviceName string) error { return nil }
func (s *stubRegistry) Discover(ctx context.Context, serviceName string) ([]string, error) {
	s.asked = append(s.asked, serviceName)
	return nil, s.err
}

var _ discovery.Registry = (*stubRegistry)(nil)

func TestNewClient_DiscoversTheLedgerServiceName(t *testing.T) {
	reg := &stubRegistry{err: errors.New("no instances")}
	c := ledger.NewClient(reg)
	require.NotNil(t, c)

	_, err := c.GetTransaction(context.Background(), &pb.GetTransactionRequest{})

	require.Error(t, err, "a downstream that cannot be resolved must surface an error")
	assert.Equal(t, []string{"ledger"}, reg.asked,
		"the client must discover the name ledger-service registers under")
}

func TestNewClient_ListEntries_UsesTheSameDiscoveryPath(t *testing.T) {
	reg := &stubRegistry{err: errors.New("no instances")}
	c := ledger.NewClient(reg)

	_, err := c.ListEntries(context.Background(), &pb.ListEntriesRequest{})

	require.Error(t, err)
	assert.Equal(t, []string{"ledger"}, reg.asked)
}

// A missing downstream is a runtime failure, never a boot failure — the gateway
// must start with ledger-service absent, exactly as it does for the other five.
func TestNewClient_ConstructsWithoutDialing(t *testing.T) {
	reg := &stubRegistry{err: errors.New("no instances")}

	assert.NotNil(t, ledger.NewClient(reg))
	assert.Empty(t, reg.asked, "construction must not dial; the connection is lazy")
}
