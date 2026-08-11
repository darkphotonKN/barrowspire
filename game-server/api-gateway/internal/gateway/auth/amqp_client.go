package auth

import (
	"context"
	"fmt"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"google.golang.org/protobuf/proto"
)

var amqpTracer = otel.Tracer("api-gateway-amqp")

type AmqpAuthClient struct {
	ch       *amqp.Channel
	exchange string
}

func NewAmqpAuthClient(ch *amqp.Channel) *AmqpAuthClient {
	return &AmqpAuthClient{
		ch:       ch,
		exchange: commonconstants.AuthEventsExchange,
	}
}

// RpcCall sends a protobuf-encoded request via RabbitMQ and waits for a reply.
func (h *AmqpAuthClient) RpcCallNoWaitResponse(ctx context.Context, routingKey string, payload []byte) error {

	// Generate correlation ID to match request with reply
	correlationId := uuid.New().String()

	// Publish message with ReplyTo and CorrelationId
	err := h.ch.PublishWithContext(ctx, h.exchange, routingKey, false, false,
		amqp.Publishing{
			ContentType:   "application/protobuf",
			Body:          payload,
			CorrelationId: correlationId,
		})
	if err != nil {
		return fmt.Errorf("failed to publish rpc message: %w", err)
	}

	return nil
}

// SignupHandler handles member signup via AMQP (fire-and-forget).
func (h *AmqpAuthClient) SignupHandler(c *gin.Context) {
	const op = "SignupHandler"

	ctx := c.Request.Context()
	ctx, span := amqpTracer.Start(ctx, "amqp.Signup")
	defer span.End()

	var req pb.CreateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	body, err := proto.Marshal(&req)
	if err != nil {
		// Our own encoding failed, so this is a genuine internal fault and NOT
		// retryable — it stays 500 rather than joining the broker case below.
		httperr.Write(c, op, err)
		return
	}

	if err := h.RpcCallNoWaitResponse(ctx, commonconstants.AuthMemberCreate, body); err != nil {
		// The broker is unreachable, which is the retryable kind of failure:
		// the request was fine and would succeed once the broker is back. 503,
		// not 500, per FS-0001 §Requirements 5 as amended.
		httperr.Write(c, op, apperr.WithDetail(
			fmt.Errorf("%w: publishing signup: %w", apperr.ErrUnavailable, err),
			"Signup is temporarily unavailable"))
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"statusCode": http.StatusAccepted,
		"message":    "Signup request accepted",
	})
}
