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
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/stats-service/config"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
)

var (
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "production")

	// observability
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"
	serviceVersion    = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	serviceName = "stats"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_STATS_ADDR", "7124")

	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")

	// redis
	redisHost = commonhelpers.GetEnvString("REDIS_HOST", "localhost")
	redisPort = commonhelpers.GetEnvString("REDIS_PORT", "6492")
	redisDB   = commonhelpers.GetEnvString("REDIS_DB", "0")
)

func main() {
	ctx := context.Background()

	// --- shutdown signal ---
	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

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

	// --- database setup ---
	db := config.InitDB()
	defer db.Close()

	// --- redis setup ---
	redisDBInt, err := strconv.Atoi(redisDB)
	if err != nil {
		log.Fatal(err)
	}

	err = config.InitRedis(config.RedisConfig{
		Mode:         "standalone",
		Addrs:        []string{redisHost + ":" + redisPort},
		Password:     "",
		DB:           redisDBInt,
		PoolSize:     10,
		MinIdleConns: 5,
	})
	if err != nil {
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	defer config.CloseRedis()

	grpcServer := grpc.NewServer()

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
		log.Println("Metrics server started on :8196")
		http.ListenAndServe(":8196", nil)
	}()

	ch, brokerClose := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	defer func() {
		brokerClose()
		ch.Close()
	}()

	// --- outbox workers ---
	outboxRepo := commonoutbox.NewRepo(db)
	outboxServ := commonoutbox.NewService(outboxRepo)
	publisher := commonbroker.NewAmqpPublisher(ch)
	// TODO: update in prod
	workcycyleTime := time.Minute * 1

	workersWg := sync.WaitGroup{}
	// add the number of workers
	workersWg.Add(1)
	outboxWorker := commonoutbox.NewOutboxWorker(workcycyleTime, 20, outboxServ, publisher, &workersWg)

	// WARN: we pass context.Background() here to gracefully stop workers with
	// with an explicit cancel , take care not to remove that in main.go here
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()

	go outboxWorker.Run(workerCtx)

	// use the new config setup to initialize all services
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

	grpcServer, err = config.SetupServices(db, ch, republishCh)
	if err != nil {
		slog.Error("failed to set up stats service", "error", err)
		os.Exit(1)
	}

	log.Printf("grpc Stats Server started on PORT: %s\n", grpcAddr)

	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("Can't connect to grpc server. Error:", err.Error())
		}
	}()

	<-sigCtx.Done() // wait for SIGTERM
	slog.Info("shutdown: signal received")

	// give 20 second grace period for the other services shutdown
	doneCh := make(chan struct{})

	// graceful shutdown for grpc server first, stop the final requests
	go func() {
		grpcServer.GracefulStop()
		close(doneCh)
	}()
	select {
	case <-doneCh:
		slog.Info("shutting down after graceful stop...")
	case <-time.After(time.Second * 20):
		slog.Info("shutting down after waiting 20 secs...")
		grpcServer.Stop()
	}

	// then shutdown the outbox workers
	workerCancel() // cancel and let workers finish

	workersDone := make(chan struct{})
	go func() {
		workersWg.Wait()
		// gracefully send workers are done
		close(workersDone)
	}()

	select {
	case <-workersDone:
		slog.Info("outbox workers shutdown gracefully...")
		// back up, don't allow more than 10 seconds
	case <-time.After(time.Second * 10):
		slog.Info("outbox workers stopped after waiting 10 seconds...")
	}

	// db, broker and redis are closed by the deferred calls above
	slog.Info("shutdown clean")
}
