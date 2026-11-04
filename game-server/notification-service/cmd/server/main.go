package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"os"

	"github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/notification-service/config"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
)

var (
	// observability
	environment       = commonhelpers.GetEnvString("ENVIRONMENT", "development")
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"

	serviceName    = "notification"
	grpcAddr       = commonhelpers.GetEnvString("GRPC_NOTIFICATION_ADDR", "7190")
	serviceVersion = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")

	// items-service, for resolving a letter's item enclosures at send (ADR-0022).
	// The local defaults are IP literals: gRPC's dns resolver takes seconds on
	// "localhost", longer than the mailbox's 5 s call deadlines.
	itemsAddr = commonhelpers.GetEnvString("ITEMS_ADDR", "127.0.0.1:7126")
	// wallet-service, for crediting a claimed letter's gold (FS-1GZGD R16)
	walletAddr = commonhelpers.GetEnvString("WALLET_ADDR", "127.0.0.1:7128")
	// Redis, for the mail:arrived hint after a letter commits (ADR-0045); the
	// default is the compose Redis on the host
	redisAddr = commonhelpers.GetEnvString("REDIS_ADDR", "127.0.0.1:6492")
)

func main() {
	// before anything else: without the key every forwarded token is forgeable
	jwtSecret, err := config.JWTSecret()
	if err != nil {
		slog.Error("notification cannot start", "error", err)
		os.Exit(1)
	}

	db := config.InitDB()
	defer db.Close()

	ctx := context.Background()

	// --- observability ---
	shutdown, err := commontelemetry.Init(ctx, commontelemetry.Config{
		ServiceName:       serviceName,
		ServiceVersion:    serviceVersion,
		Environment:       environment,
		CollectorEndpoint: collectorEndpoint,
		Enabled:           otelEnabled,
	})
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown(ctx)

	grpcServer := grpc.NewServer()

	listener, err := net.Listen("tcp", ":"+grpcAddr)
	if err != nil {
		log.Fatalf(
			"Failed to listen at port: %s\nError: %s\n", grpcAddr, err,
		)
	}
	defer listener.Close()

	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	defer func() {
		close()
		ch.Close()
	}()

	// lazy dial: notification boots with items absent, and a send that needs
	// items while it is down answers Unavailable
	itemsConn, err := discovery.Dial(itemsAddr)
	if err != nil {
		log.Fatalf("Failed to dial items service at %s: %s", itemsAddr, err)
	}
	defer itemsConn.Close()

	// lazy dial too: a claim with gold while wallet is down answers
	// Unavailable and stays re-drivable
	walletConn, err := discovery.Dial(walletAddr)
	if err != nil {
		log.Fatalf("Failed to dial wallet service at %s: %s", walletAddr, err)
	}
	defer walletConn.Close()

	// never fatal: Redis down only silences the new-letter hint
	redisClient := config.NewRedisClient(redisAddr)
	defer redisClient.Close()

	// Use the new config setup to initialize all services
	grpcServer = config.SetupServices(db, ch, itemsConn, walletConn, redisClient, jwtSecret)

	log.Printf("Notification Server started on PORT: %s\n", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
