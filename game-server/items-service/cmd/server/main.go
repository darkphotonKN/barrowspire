package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/common/temporal/smoke"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/items-service/config"
	"github.com/darkphotonKN/barrowspire-server/items-service/grpc/auth"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	sdklog "go.temporal.io/sdk/log"
	"go.temporal.io/sdk/worker"
)

var (
	// observability
	environment       = commonhelpers.GetEnvString("ENVIRONMENT", "development")
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"

	serviceName    = "items"
	grpcAddr       = commonhelpers.GetEnvString("GRPC_ITEMS_ADDR", "7126")
	authAddr       = commonhelpers.GetEnvString("AUTH_ADDR", "localhost:7116")
	serviceVersion = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
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

	// test
	// repo := items.NewRepository(db)
	// testItemId := uuid.MustParse("aa0e8400-e29b-41d4-a716-446655440001")

	// itemData, err := repo.GetItemTemplateByID(ctx, testItemId)
	// slog.Info("Debugging get item template", "itemData", itemData)
	// end test

	// --- grpc ---
	// grpcServer := grpc.NewServer()

	listener, err := net.Listen("tcp", ":"+grpcAddr)
	if err != nil {
		log.Fatalf(
			"Failed to listen at port: %s\nError: %s\n", grpcAddr, err,
		)
	}
	defer listener.Close()

	// --- metrics ---

	// setup endpoint for metrics collection
	go func() {
		http.Handle("/metrics", promhttp.Handler())
		log.Println("Metrics server started on :8197")
		http.ListenAndServe(":8197", nil)
	}()

	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	// Declare the items events exchange
	broker.DeclareExchange(ch, commonconstants.ItemEventsExchange, "topic")

	defer func() {
		close()
		ch.Close()
	}()

	// outbox
	// --- outbox workers ---
	outboxRepo := commonoutbox.NewRepo(db)
	outboxServ := commonoutbox.NewService(outboxRepo)
	publisher := commonbroker.NewAmqpPublisher(ch)
	// TODO: update in prod
	workcycyleTime := time.Minute * 1
	outboxWorker := commonoutbox.NewOutboxWorker(workcycyleTime, 20, outboxServ, publisher)

	workerCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	go outboxWorker.Run(workerCtx)
	// Use the new config setup to initialize all services
	authClient, err := auth.NewClient(authAddr)
	if err != nil {
		log.Fatalf("Failed to create auth client: %s", err)
	}
	defer func() {
		if err := authClient.Close(); err != nil {
			slog.Error("close auth client", "error", err)
		}
	}()

	// The consumer republishes retries and dead letters on a connection of its
	// own: a channel in confirm mode, apart from the shared one, and kept off
	// the consuming connection so broker flow control on publishes cannot stall
	// consumption.
	republishConn, republishCh, err := config.InitializeAMQPConnection(
		fmt.Sprintf("amqp://%s:%s@%s:%s", amqpUser, amqpPassword, amqpHost, amqpPort))
	if err != nil {
		slog.Error("failed to open the consumer's republish connection", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := republishConn.Close(); err != nil {
			slog.Error("close republish connection", "error", err)
		}
	}()

	grpcServer, activities, err := config.SetupServices(ctx, db, ch, republishCh, authClient)
	if err != nil {
		slog.Error("failed to set up items service", "error", err)
		os.Exit(1)
	}

	// --- temporal worker ---
	// Items owns the data behind its settlement steps, so its activities run in
	// this process on the `items` task queue (ADR-0011). Separate queues mean
	// separate activity slot pools: a degraded items cannot starve the steps
	// past the saga's pivot.
	temporalLogger := sdklog.NewStructuredLogger(slog.Default())

	temporalCfg, err := bstemporal.LoadConfig(bstemporal.QueueItems)
	if err != nil {
		log.Fatalf("Failed to load temporal config: %s", err)
	}

	temporalClient, err := bstemporal.Dial(ctx, temporalCfg, temporalLogger)
	if err != nil {
		log.Fatalf("Failed to connect to temporal: %s", err)
	}
	defer temporalClient.Close()

	temporalRunner, err := bstemporal.NewRunner(temporalClient, temporalCfg, temporalLogger, worker.Options{},
		smoke.RegisterActivity,

		activities.FreezeItemActivity.Register,
		activities.ReturnItemActivity.Register,
		activities.TransferItemActivity.Register,
		activities.UnfreezeItemActivity.Register,
	)
	if err != nil {
		log.Fatalf("Failed to build temporal worker: %s", err)
	}
	defer temporalRunner.Stop()

	if err := temporalRunner.Start(); err != nil {
		log.Fatalf("Failed to start temporal worker: %s", err)
	}

	log.Printf("grpc Items Server started on PORT: %s\n", grpcAddr)

	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("Can't connect to grpc server. Error:", err.Error())
		}
	}()

	// Blocking on a signal instead of on Serve is what gives the deferred worker
	// shutdown a chance to run at all. Killed with the process, a worker leaves
	// its pollers registered until Temporal times them out, and its in-flight
	// activities wait out their StartToCloseTimeout before being retried.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	grpcServer.GracefulStop()
}
