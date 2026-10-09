package character

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"google.golang.org/protobuf/types/known/emptypb"
)

// CharacterClient is what the typed character operations need from
// character-service. Every request carries the member taken from the token.
type CharacterClient interface {
	CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.Character, error)
	ListCharacters(ctx context.Context, req *pb.ListCharactersRequest) (*pb.ListCharactersResponse, error)
	GetCharacter(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error)
	DeleteCharacter(ctx context.Context, req *pb.DeleteCharacterRequest) (*emptypb.Empty, error)
}
