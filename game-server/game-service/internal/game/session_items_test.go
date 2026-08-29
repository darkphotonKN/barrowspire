package game

import (
	"context"
	"errors"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

/**
* A session must still be creatable when the items service cannot supply a
* catalogue. Item seeding is decoration on the map, not a precondition for the
* run, so a failure here degrades to a session with no ground loot rather than
* taking down the whole game server.
**/
func TestInitializeItemsWithoutACatalogue(t *testing.T) {
	tests := []struct {
		name    string
		resp    *pb.ListItemTemplatesResponse
		respErr error
		wantErr bool
	}{
		{
			name:    "items service is unreachable",
			resp:    nil,
			respErr: errors.New("rpc error: code = Unavailable desc = connection refused"),
			wantErr: true,
		},
		{
			name:    "items service answers with a nil response and no error",
			resp:    nil,
			respErr: nil,
			wantErr: false,
		},
		{
			name:    "items service answers with an empty catalogue",
			resp:    &pb.ListItemTemplatesResponse{},
			respErr: nil,
			wantErr: false,
		},
		{
			name:    "items service answers with a nil item slice",
			resp:    &pb.ListItemTemplatesResponse{Items: nil},
			respErr: nil,
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockClient := &mockItemsClient{}
			mockClient.On("ListItemTemplates", mock.Anything).Return(tc.resp, tc.respErr)

			session := &Session{itemsClient: mockClient}

			// the panic this guards against took down the whole process, not just the session
			require.NotPanics(t, func() {
				err := session.InitializeItems(context.Background())

				if tc.wantErr {
					assert.Error(t, err)
					return
				}
				assert.NoError(t, err)
			})
		})
	}
}
