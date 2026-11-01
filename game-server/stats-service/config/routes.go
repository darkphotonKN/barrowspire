package config

import (
	"fmt"
	"log/slog"
	"net"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/darkphotonKN/barrowspire-server/stats-service/internal/stats"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	"google.golang.org/grpc"
)

// SetupServices initializes all services and their dependencies. republishCh
// is a channel used for nothing else: the consumer puts it in confirm mode to
// republish retries and dead letters. An error means the service cannot run
// safely and must not start.
func SetupServices(db *sqlx.DB, amqpChannel, republishCh *amqp.Channel) (*grpc.Server, error) {
	// create repository
	repo := stats.NewRepository(db)

	// create cache service
	cacheService := cache.NewRedisCache(GetClient())

	// create service with repository, inbox, AMQP channel, and cache; the inbox
	// writes into stats' own processed_events inside each event's transaction
	publishCh := commonbroker.NewAmqpPublisher(amqpChannel) // adapter
	service := stats.NewService(repo, commoninbox.NewRepo(), publishCh, db, cacheService)

	// create gRPC handler with service
	handler := stats.NewHandler(service)

	// create AMQP consumer with service; it republishes through its own
	// confirm-mode channel, never the one it consumes from
	republisher, err := stats.NewConfirmPublisher(republishCh)
	if err != nil {
		return nil, fmt.Errorf("open consumer republisher: %w", err)
	}
	consumer := stats.NewConsumer(service, amqpChannel, republisher)

	// set up AMQP infrastructure: without the delay queues and the DLQ the
	// consumer has nowhere to park a failed event
	if err := stats.SetupAMQPInfrastructure(amqpChannel); err != nil {
		return nil, fmt.Errorf("setup amqp infrastructure: %w", err)
	}

	// start listening for AMQP events
	if err := consumer.Listen(); err != nil {
		return nil, fmt.Errorf("start amqp consumers: %w", err)
	}

	// create gRPC server
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(commoninterceptor.Metrics()))

	// Register stats service with gRPC server
	pb.RegisterStatsServiceServer(grpcServer, handler)

	slog.Info("Stats service initialized successfully")

	return grpcServer, nil
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
