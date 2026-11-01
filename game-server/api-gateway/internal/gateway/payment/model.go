package payment

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
)

type PaymentClient interface {
	ProcessWebhook(ctx context.Context, req *pb.ProcessWebhookRequest) (*pb.ProcessWebhookResponse, error)
}
