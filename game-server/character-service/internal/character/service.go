package character

import (
	"context"
	"fmt"
	"log/slog"

	// pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

type service struct {
	repo      Repository
	publishCh *amqp.Channel
}

type Repository interface {
	CreateCharacter(character *Character) (*Character, error)
	GetByID(id uuid.UUID) (*Character, error)
}

func NewService(repo Repository, ch *amqp.Channel) Service {
	return &service{repo: repo, publishCh: ch}
}

func (s *service) CreateCharacter(ctx context.Context, character *Character) (*Character, error) {
	// format to fit grpc structure

	result, err := s.repo.CreateCharacter(character)
	if err != nil {
		slog.Error("failed to create character", "error", err)
		return nil, fmt.Errorf("service failed to create character %w", err)
	}

	return result, nil
}
