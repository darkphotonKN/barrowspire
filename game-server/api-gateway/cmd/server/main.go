package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/config"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commontracing "github.com/darkphotonKN/barrowspire-server/common/tracing"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	_ "github.com/joho/godotenv/autoload"
)

var (
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "production")

	// observability
	serviceVersion = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	serviceName = "api-gateway"

	// http
	httpAddr = commonhelpers.GetEnvString("PORT", "7114")

	// prometheus scrape port, off the public router. Unique per service so local
	// runs on one host never clash; the same port is used in k8s.
	metricsPort = commonhelpers.GetEnvString("METRICS_PORT", "8193")

	// browser origins allowed by CORS, comma separated (the frontend URLs)
	corsOrigins = commonhelpers.GetEnvString("CORS_ORIGINS", "http://localhost:3938,http://localhost:3000")

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
	shutdownTracing, err := commontracing.Init(ctx, serviceName)
	if err != nil {
		log.Fatal(err)
	}
	defer commontracing.Close(shutdownTracing)
	commontelemetry.ServeMetrics(metricsPort)

	// --- database setup removed - api gateway is stateless ---

	// --- message broker - rabbit mq ---
	ch, closeCh := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)
	broker.DeclareExchange(ch, commonconstants.AuthEventsExchange, "topic")
	defer func() {
		closeCh()
		ch.Close()
	}()

	// --- router setup ---
	// Dev-only routes (POST /wallet/deposit for scripts/seed-dev.sh) follow
	// ENVIRONMENT, opt-in like debug logging: only "development" turns them on,
	// so the "production" default, a typo or an unset value keeps them off.
	devEndpoints := strings.EqualFold(environment, "development")
	if devEndpoints {
		slog.Warn("ENVIRONMENT is development: dev-only routes such as POST /api/wallet/deposit are mounted")
	}

	router, closeDownstreams, err := config.SetupRouter(downstreams, splitOrigins(corsOrigins), ch,
		config.Features{DevEndpoints: devEndpoints})
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

// splitOrigins turns "a, b,c" into ["a" "b" "c"], dropping empty entries.
func splitOrigins(raw string) []string {
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}
