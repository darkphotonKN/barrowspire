package config

import (
	"context"
	"log/slog"
	"net"
	"os"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commoncache "github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/darkphotonKN/barrowspire-server/items-service/grpc/auth"
	"github.com/darkphotonKN/barrowspire-server/items-service/internal/items"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// SetupServices initializes all services and their dependencies
func SetupServices(ctx context.Context, db *sqlx.DB, amqpChannel *amqp.Channel, registry discovery.Registry) *grpc.Server {
	// Create Auth Service client
	authClient := auth.NewClient(registry)

	// -- outbox --
	outboxRepo := commonoutbox.NewRepo(db)
	outboxService := commonoutbox.NewService(outboxRepo)

	// Create repository
	repo := items.NewRepository(db)

	// Create service with repository and AMQP channel
	publishCh := commonbroker.NewAmqpPublisher(amqpChannel)
	service := items.NewService(repo, db, publishCh, outboxService)

	// Create gRPC handler with service and auth client
	handler := items.NewHandler(service, authClient)

	// cache client
	cache := commoncache.NewRedisCache(GetClient())

	// Set up AMQP infrastructure
	if err := items.SetupAMQPInfrastructure(amqpChannel); err != nil {
		slog.Error("Failed to setup AMQP infrastructure", "error", err)
	}

	// Create AMQP consumer with service
	consumer := items.NewConsumer(service, amqpChannel, cache)
	// Start listening for AMQP events
	consumer.Listen(ctx)

	// Create gRPC server
	validate := commonauth.NewValidator([]byte(os.Getenv("JWT_SECRET")))
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Recovery(slog.Default()),
			commonauth.Auth(validate),
		),
	)

	pb.RegisterItemsServiceServer(grpcServer, handler)
	reflection.Register(grpcServer)

	slog.Info("Items service initialized successfully")

	return grpcServer
}

// StartGRPCServer starts the gRPC server on the specified port
func StartGRPCServer(grpcServer *grpc.Server, port string) error {
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return err
	}

	slog.Info("Starting gRPC server", "port", port)

	// This blocks until the server is stopped
	if err := grpcServer.Serve(listener); err != nil {
		return err
	}

	return nil
}

// InitializeAMQPConnection establishes connection to RabbitMQ
func InitializeAMQPConnection(amqpURL string) (*amqp.Connection, *amqp.Channel, error) {
	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return nil, nil, err
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, nil, err
	}

	slog.Info("Connected to RabbitMQ")

	return conn, channel, nil
}
