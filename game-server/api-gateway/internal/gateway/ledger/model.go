package ledger

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
)

// LedgerClient is what this group needs from ledger-service, and nothing more.
//
// Read-only by construction, not by convention: the write path is a Temporal
// activity executed in-process by ledger-service's own worker (ADR-0011), so it
// has no RPC to expose here and no gateway route to reach it. There is nothing
// to add to this interface without changing that decision.
type LedgerClient interface {
	GetTransaction(ctx context.Context, req *pb.GetTransactionRequest) (*pb.GetTransactionResponse, error)
	ListEntries(ctx context.Context, req *pb.ListEntriesRequest) (*pb.ListEntriesResponse, error)
}
