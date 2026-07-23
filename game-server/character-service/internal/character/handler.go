package character

import (
	"golang.org/x/net/context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
)

type Handler struct {
	service Service
	pb.UnimplementedCharacterServiceServer
}

type Service interface {
	CreateCharacter(ctx context.Context, req *Character) (*Character, error)
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.CreateCharacterResponse, error) {
	// id, err := uuid.Parse(req.Id)

	// if err != nil {
	// 	return nil, err
	// }

	character := &Character{
		Name:    req.Name,
		ClassID: req.Class,
	}
	result, err := h.service.CreateCharacter(ctx, character)

	if err != nil {
		return nil, err
	}

	response := &pb.CreateCharacterResponse{
		ID:    result.ID,
		Class: result.ClassID,
		Name:  result.Name,
	}
	return response, nil
}
