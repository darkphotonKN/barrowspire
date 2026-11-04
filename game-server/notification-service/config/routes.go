package config

import (
	"log/slog"
	"net"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/inbox"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/mailbox"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/notification"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

// SetupServices initializes all services and their dependencies.
//
// itemsConn is the connection to items-service, which the mailbox resolves
// item enclosures through at send (FS-1GZGD R4) and grants a claim's items
// through (R15); walletConn is wallet-service's, which credits a claim's gold
// (R16). redisClient carries mail arrivals to the game pods after a letter
// commits (R41, ADR-0045). jwtSecret verifies the token the gateway forwards
// on every mailbox call.
func SetupServices(db *sqlx.DB, amqpChannel *amqp.Channel, itemsConn, walletConn grpc.ClientConnInterface, redisClient *redis.Client, jwtSecret []byte) *grpc.Server {
	// Create repositories
	repo := notification.NewRepository(db)
	inboxRepo := inbox.NewRepo()

	// Outbound mail (FS-V6SFK R26): SMTP, Mailpit in dev
	mailer := notification.NewSMTPMailer(LoadSMTPConfig())

	// Mailbox (FS-1GZGD, ADR-0044). One arrival publisher announces the
	// letters every door stores (R41, R52); the letter request shares this
	// service's inbox (R12).
	arrivals := mailbox.NewRedisArrivalPublisher(redisClient)
	mailboxService := mailbox.NewService(db, mailbox.NewRepository(db),
		mailbox.NewItemsClient(itemsConn), mailbox.NewWalletClient(walletConn), arrivals, inboxRepo)
	mailboxHandler := mailbox.NewHandler(mailboxService)

	// Create service with repositories and DB handle (for tx-wrapped inbox
	// pattern); the signup handling stores each new account's welcome letter
	// through the mailbox (FS-1GZGD R57)
	service := notification.NewService(db, repo, inboxRepo, mailer, mailboxService)

	// Create gRPC handler with service
	handler := notification.NewHandler(service)

	// Create AMQP consumer with service; letter requests go to the mailbox
	consumer := notification.NewConsumer(service, mailboxService, amqpChannel)

	// Set up AMQP infrastructure
	if err := notification.SetupAMQPInfrastructure(amqpChannel); err != nil {
		slog.Error("Failed to setup AMQP infrastructure", "error", err)
	}

	// Start listening for AMQP events
	consumer.Listen()

	// Create gRPC server
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(
		commoninterceptor.Metrics(),
		authenticate(commonauth.NewValidator(jwtSecret)),
	))

	// Register notification service with gRPC server: notification and
	// mailbox methods are one NotificationService
	pb.RegisterNotificationServiceServer(grpcServer, newNotificationServer(handler, mailboxHandler))

	slog.Info("Notification service initialized successfully")

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
