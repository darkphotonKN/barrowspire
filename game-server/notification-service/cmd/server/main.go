package main

import (
	"context"
	"log"
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

	// items-service, for resolving a letter's item enclosures at send (ADR-0022)
	itemsAddr = commonhelpers.GetEnvString("ITEMS_ADDR", "localhost:7126")
)

func main() {
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

	// Use the new config setup to initialize all services
	grpcServer = config.SetupServices(db, ch, itemsConn, []byte(os.Getenv("JWT_SECRET")))

	log.Printf("Notification Server started on PORT: %s\n", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
