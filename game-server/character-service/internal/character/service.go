package character

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

type service struct {
	repo      Repository
	publishCh *amqp.Channel
}

type Repository interface {
	Create(character *CharacterCreate) (*Character, error)
	GetByID(id uuid.UUID) (*Character, error)
}

func NewService(repo Repository, ch *amqp.Channel) Service {
	return &service{repo: repo, publishCh: ch}
}

func (s *service) GetCharacter(ctx context.Context, id uuid.UUID) (*pb.Character, error) {
	character, err := s.repo.GetByID(id)

	if err != nil {
		return nil, err
	}

	// format to fit grpc structure
	return &pb.Character{
		Id: character.ID,
	}, nil
}
