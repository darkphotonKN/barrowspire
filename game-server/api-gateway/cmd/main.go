package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/config"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	_ "github.com/joho/godotenv/autoload"
)

var (
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "development")

	// observability
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"
	serviceVersion    = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	serviceName = "api-gateway"

	// http
	httpAddr = commonhelpers.GetEnvString("PORT", "7114")

	// downstream gRPC services ("host:port")
	downstreams = config.Downstreams{
		Auth:         commonhelpers.GetEnvString("AUTH_ADDR", "localhost:7116"),
		Stats:        commonhelpers.GetEnvString("STATS_ADDR", "localhost:7124"),
		Notification: commonhelpers.GetEnvString("NOTIFICATION_ADDR", "localhost:7190"),
		Payment:      commonhelpers.GetEnvString("PAYMENT_ADDR", "localhost:7134"),
		Items:        commonhelpers.GetEnvString("ITEMS_ADDR", "localhost:7126"),
		Ledger:       commonhelpers.GetEnvString("LEDGER_ADDR", "localhost:7129"),
		Marketplace:  commonhelpers.GetEnvString("MARKETPLACE_ADDR", "localhost:7127"),
		Wallet:       commonhelpers.GetEnvString("WALLET_ADDR", "localhost:7128"),
		Character:    commonhelpers.GetEnvString("CHARACTER_ADDR", "localhost:7123"),
	}

	// rabbitmq
	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
)

/**
* Main entry point to entire application.
* NOTE: Keep code here as clean and little as possible.
**/
func main() {
	ctx := context.Background()

	// --- logger ---
	commonhelpers.SetupLogger(environment)

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
	// --- database setup removed - api gateway is stateless ---

	// --- message broker - rabbit mq ---
	ch, closeCh := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)
	broker.DeclareExchange(ch, commonconstants.AuthEventsExchange, "topic")
	defer func() {
		closeCh()
		ch.Close()
	}()

	// --- router setup ---
	router, closeDownstreams, err := config.SetupRouter(downstreams, ch)
	if err != nil {
		log.Fatalf("Failed to set up router: %v", err)
	}
	defer func() {
		if err := closeDownstreams(); err != nil {
			slog.Error("close downstream clients", "error", err)
		}
	}()

	// -- start server --
	if err := router.Run(fmt.Sprintf(":%s", httpAddr)); err != nil {
		log.Fatal("Failed to start server")
	}
}
