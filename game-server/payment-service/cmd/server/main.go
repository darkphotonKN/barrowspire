package main

import (
	"log"
	"log/slog"
	"net"

	authpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/darkphotonKN/barrowspire-server/payment-service/config"
	"github.com/darkphotonKN/barrowspire-server/payment-service/internal/payment"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"github.com/stripe/stripe-go/v82"
	"google.golang.org/grpc"
)

var (
	grpcAddr            = commonhelpers.GetEnvString("GRPC_PAYMENT_ADDR", "7134")
	authAddr            = commonhelpers.GetEnvString("AUTH_ADDR", "localhost:7116")
	amqpUser            = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword        = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost            = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort            = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
	stripeSecretKey     = commonhelpers.GetEnvString("STRIPE_SECRET_KEY", "")
	stripeWebhookSecret = commonhelpers.GetEnvString("STRIPE_WEBHOOK_SECRET", "")
	redisAddr           = commonhelpers.GetEnvString("REDIS_ADDR", "localhost:6492")
	redisPassword       = commonhelpers.GetEnvString("REDIS_PASSWORD", "")
)

func main() {
	// --- stripe setup ---
	if stripeSecretKey == "" {
		log.Fatal("STRIPE_SECRET_KEY is required")
	}
	stripe.Key = stripeSecretKey

	// --- redis setup ---
	if err := config.InitRedis(redisAddr, redisPassword, 0); err != nil {
		log.Fatalf("Failed to init Redis: %v", err)
	}
	defer config.CloseRedis()
	cacheService := cache.NewRedisCache(config.GetRedisClient())

	// --- database setup ---
	db := config.InitDB()
	defer db.Close()

	// --- grpc ---
	grpcServer := grpc.NewServer()

	listener, err := net.Listen("tcp", ":"+grpcAddr)
	if err != nil {
		log.Fatalf("Failed to listen at port: %s\nError: %s\n", grpcAddr, err)
	}
	defer listener.Close()

	// --- message broker - rabbit mq ---
	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)
	defer func() {
		close()
		ch.Close()
	}()

	// Initialize layers
	repo := payment.NewRepository(db)
	processor := payment.NewStripeProcessor()
	authConn, err := discovery.Dial(authAddr)
	if err != nil {
		log.Fatalf("Failed to create auth client: %s", err)
	}
	defer func() {
		if err := authConn.Close(); err != nil {
			slog.Error("close auth client", "error", err)
		}
	}()

	svc := payment.NewService(repo, processor, ch, authpb.NewAuthServiceClient(authConn), cacheService, stripeWebhookSecret)
	handler := payment.NewHandler(svc)

	pb.RegisterPaymentServiceServer(grpcServer, handler)

	log.Printf("gRPC Payment Server started on PORT: %s\n", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
