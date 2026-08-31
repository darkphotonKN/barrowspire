package character

import (
	"golang.org/x/net/context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/google/uuid"
)

type Handler struct {
	service Service
	pb.UnimplementedCharacterServiceServer
}

type Service interface {
	GetCharacter(ctx context.Context, id uuid.UUID) (*pb.Character, error)
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetExample(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	id, err := uuid.Parse(req.Id)

	if err != nil {
		return nil, err
	}

	result, err := h.service.GetCharacter(ctx, id)

	if err != nil {
		return nil, err
	}

	return result, nil
}
