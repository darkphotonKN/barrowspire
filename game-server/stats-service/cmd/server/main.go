package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
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
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "development")

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

	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	defer func() {
		close()
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

	workerCtx, cancel := context.WithCancel(ctx)
	defer cancel()

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

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
