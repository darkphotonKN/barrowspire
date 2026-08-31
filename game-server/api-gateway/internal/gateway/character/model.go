package character

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
)

type CharacterClient interface {
	CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.CreateCharacterResponse, error)
}
