package grpc

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// wallet resolves the account from the caller's token, so the outbound call
// must carry the same authorization header the inbound request arrived with.
func TestForwardAuthorization(t *testing.T) {
	tests := []struct {
		name     string
		incoming metadata.MD
		wantCode codes.Code
	}{
		{
			name:     "forwards the caller's token",
			incoming: metadata.New(map[string]string{"authorization": "Bearer caller-token"}),
			wantCode: codes.OK,
		},
		{
			name:     "no metadata at all",
			incoming: nil,
			wantCode: codes.Unauthenticated,
		},
		{
			name:     "metadata without authorization",
			incoming: metadata.New(map[string]string{"x-other": "value"}),
			wantCode: codes.Unauthenticated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.incoming != nil {
				ctx = metadata.NewIncomingContext(ctx, tt.incoming)
			}

			outCtx, err := forwardAuthorization(ctx)

			require.Equal(t, tt.wantCode, status.Code(err))
			if tt.wantCode != codes.OK {
				return
			}

			out, ok := metadata.FromOutgoingContext(outCtx)
			require.True(t, ok)
			assert.Equal(t, []string{"Bearer caller-token"}, out.Get("authorization"))
		})
	}
}
