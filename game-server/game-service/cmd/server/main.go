package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/game-service/config"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components/metrics"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
)

var (
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "development")

	// observability
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"
	serviceVersion    = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	// game service
	gamePort = fmt.Sprintf(":%s", commonhelpers.GetEnvString("GAME_PORT", "5668"))

	// grpc
	serviceName = "game"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_GAME_ADDR", "7117")

	// downstream gRPC services ("host:port")
	downstreams = config.Downstreams{
		Auth:      commonhelpers.GetEnvString("AUTH_ADDR", "localhost:7116"),
		Items:     commonhelpers.GetEnvString("ITEMS_ADDR", "localhost:7126"),
		Character: commonhelpers.GetEnvString("CHARACTER_ADDR", "localhost:7123"),
	}

	// rabbit mq
	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
)

func main() {
	// --- root context ---
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// --- pod identity ---
	pod := config.LoadPod(gamePort)
	slog.Info("Pod identity", "pod_id", pod.ID, "pod_name", pod.Name, "pod_addr", pod.Addr, "pod_id_generated", pod.Generated)

	// --- database setup (runs migrations; aborts startup on failure) ---
	db := config.InitDB()
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("close database", "error", err)
		}
	}()

	// --- pprof ---

	// TODO: remove after benchmark passes
	runtime.SetMutexProfileFraction(5)
	runtime.SetBlockProfileRate(1)

	// --- logger ---
	commonhelpers.SetupLogger(environment)

	// --- observability ---

	// -- default --
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

	// -- custom metrics --
	err = metrics.Init()
	if err != nil {
		log.Printf("\ncustom metrics setup init errored. Error: %v\n\n", err)
	}

	// --- redis setup ---
	err = config.InitRedis(config.RedisConfig{
		Mode:         commonhelpers.GetEnvString("REDIS_MODE", "standalone"),
		Addrs:        []string{commonhelpers.GetEnvString("REDIS_ADDR", "localhost:6492")},
		Password:     commonhelpers.GetEnvString("REDIS_PASSWORD", ""),
		DB:           0,
		PoolSize:     10,
		MinIdleConns: 5,
	})
	defer config.CloseRedis()

	if err != nil {
		log.Fatalf("Failed to initialize Redis: %v", err)
	}

	redisClient := config.GetClient()

	// --- grpc ---
	grpcServer := grpc.NewServer()

	// create a network listener to this service
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
		log.Println("Metrics server started on :8195")
		http.ListenAndServe(":8195", nil)
	}()

	// --- message broker - rabbit mq ---
	ch, brokerClose := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)
	defer func() {
		brokerClose()
		ch.Close()
	}()

	broker.DeclareExchange(ch, commonconstants.GameEventsExchange, "topic")

	// --- outbox ---
	// one outbox over game-service's own database: the game service writes
	// match-end rows to it (via SetupRouter) and the worker drains it onto the
	// existing channel; the worker runs on its own ctx and is cancelled
	// explicitly after the gRPC server stops on SIGINT/SIGTERM
	outboxRepo := commonoutbox.NewRepo(db)
	outboxServ := commonoutbox.NewService(outboxRepo)
	publisher := broker.NewAmqpPublisher(ch)
	workerSettings := config.OutboxWorkerSettings()

	workersWg := sync.WaitGroup{}
	// add the number of workers
	workersWg.Add(1)
	outboxWorker := commonoutbox.NewOutboxWorker(workerSettings.Cycle, workerSettings.Batch, outboxServ, publisher, &workersWg)

	// WARN: we pass context.Background() here to gracefully stop workers with
	// with an explicit cancel , take care not to remove that in main.go here
	workerCtx, workerCancel := context.WithCancel(context.Background())
	go outboxWorker.Run(workerCtx)

	log.Printf("grpc Game Server started on PORT: %s\n", grpcAddr)

	// routes setup
	routes, closeDownstreams, err := config.SetupRouter(ctx, db, downstreams, ch, redisClient, pod, outboxServ)
	if err != nil {
		log.Fatalf("Failed to set up router: %v", err)
	}
	defer func() {
		if err := closeDownstreams(); err != nil {
			slog.Error("close downstream clients", "error", err)
		}
	}()

	fmt.Printf("Server listening on port %s.\n", gamePort)

	go func() {
		err := routes.Run(gamePort)

		if err != nil {
			log.Fatal("Can't connect to game server. Error:", err.Error())
		}

	}()

	// Serve blocks until GracefulStop, so it runs off the main goroutine, or the
	// shutdown below (and every deferred close) would never be reached
	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("Can't connect to grpc server. Error:", err.Error())
		}
	}()

	// blocks until sigint or sigterm
	<-ctx.Done()
	stop()

	log.Println("Shutting down server")
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

	// deferred closes run now, the matchmaker's liveness delete first, while redis is open
}
