package config

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/items-service/grpc/auth"
	"github.com/darkphotonKN/barrowspire-server/items-service/internal/items"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type Activities struct {
	FreezeItemActivity   *items.FreezeItemsActivity
	ReturnItemActivity   *items.ReturnItemActivity
	TransferItemActivity *items.TransferItemsActivity
	UnfreezeItemActivity *items.UnfreezeItemActivity
}

// SetupServices initializes all services and their dependencies. republishCh
// is a channel used for nothing else: the consumer puts it in confirm mode to
// republish retries and dead letters. An error means the service cannot run
// safely and must not start.
func SetupServices(ctx context.Context, db *sqlx.DB, amqpChannel, republishCh *amqp.Channel, authClient auth.AuthClient) (*grpc.Server, *Activities, error) {

	// -- outbox --
	outboxRepo := commonoutbox.NewRepo(db)
	outboxService := commonoutbox.NewService(outboxRepo)

	// Create repository
	repo := items.NewRepository(db)

	// Create service with repository and AMQP channel
	publishCh := commonbroker.NewAmqpPublisher(amqpChannel)
	service := items.NewService(repo, db, publishCh, outboxService, commoninbox.NewRepo())

	// instantiate activity
	freezeItemActivity := items.NewItemsActivity(service)
	returnItemActivity := items.NewReturnItemsActivity(service)
	transferItemActivity := items.NewTransferItemsActivity(service)
	unfreezeItemActivity := items.NewUnfreezeItemActivity(service)

	// Create gRPC handler with service and auth client
	handler := items.NewHandler(service, authClient)

	// Set up AMQP infrastructure: without the delay queues and the DLQ the
	// consumer has nowhere to park a failed event
	if err := items.SetupAMQPInfrastructure(amqpChannel); err != nil {
		return nil, nil, fmt.Errorf("setup amqp infrastructure: %w", err)
	}

	// Create AMQP consumer with service; it republishes through its own
	// confirm-mode channel, never the one it consumes from
	republisher, err := items.NewConfirmPublisher(republishCh)
	if err != nil {
		return nil, nil, fmt.Errorf("open consumer republisher: %w", err)
	}
	consumer := items.NewConsumer(service, amqpChannel, republisher)
	// Start listening for AMQP events
	consumer.Listen(ctx)

	// Create gRPC server
	validate := commonauth.NewValidator([]byte(os.Getenv("JWT_SECRET")))
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Metrics(),
			commoninterceptor.Recovery(slog.Default()),
			commonauth.Auth(validate),
		),
	)

	pb.RegisterItemsServiceServer(grpcServer, handler)
	reflection.Register(grpcServer)

	slog.Info("Items service initialized successfully")

	return grpcServer, &Activities{
		FreezeItemActivity:   freezeItemActivity,
		ReturnItemActivity:   returnItemActivity,
		TransferItemActivity: transferItemActivity,
		UnfreezeItemActivity: unfreezeItemActivity,
	}, nil
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
