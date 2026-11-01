package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/common/temporal/smoke"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/config"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account"
	appConfig "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/config"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	sdklog "go.temporal.io/sdk/log"
	"go.temporal.io/sdk/worker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	// grpc
	grpcAddr = commonhelpers.GetEnvString("GRPC_WALLET_ADDR", "7128")

	// rabbit mq
	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
)

func main() {
	// --- logger ---
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// --- database setup ---

	db := config.InitDB()
	defer db.Close()

	ctx := context.Background()
	// --- services setup ---
	services := appConfig.NewServices(ctx, db)

	// --- grpc ---

	// -- middleware --
	validate := commonauth.NewValidator([]byte(os.Getenv("JWT_SECRET")))

	// -- server --
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Metrics(),
			commoninterceptor.Recovery(slog.Default()),
			commonauth.Auth(validate),
		),
	)

	pb.RegisterWalletServiceServer(grpcServer, services.AccHandler)
	reflection.Register(grpcServer)

	// create a network listener to this service
	listener, err := net.Listen("tcp", ":"+grpcAddr)
	if err != nil {
		log.Fatalf(
			"Failed to listen at port: %s\nError: %s\n", grpcAddr, err,
		)
	}
	defer listener.Close()

	// --- message broker - rabbit mq ---
	ch, brokerClose := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	// wallet.events is a TOPIC exchange carrying every event this service
	// publishes, keyed by routing key — the convention every other service
	// follows. It replaces a fanout exchange that was named after the single
	// event it carried, which left no room for a second one.
	broker.DeclareExchange(ch, commonconstants.WalletEventsExchange, "topic")

	defer func() {
		brokerClose()
		ch.Close()
	}()

	// The outbox worker drains wallet's outbox table onto the broker. Without
	// it an account.created row is written and never published, and the claim
	// it exists to deliver never reaches auth-service.
	// The worker publishes through broker.Publisher, not a raw channel — the
	// same adapter auth-service uses, so both services publish identically.
	publishCh := broker.NewAmqpPublisher(ch)
	workersWg := sync.WaitGroup{}
	// add the number of workers
	workersWg.Add(1)
	outboxWorker := commonoutbox.NewOutboxWorker(time.Second*5, 20, services.OutboxService, publishCh, &workersWg)

	// WARN: we pass context.Background() here to gracefully stop workers with
	// with an explicit cancel , take care not to remove that in main.go here
	workerCtx, workerCancel := context.WithCancel(context.Background())
	go outboxWorker.Run(workerCtx)

	consumer := account.NewConsumer(ch, services.CreateOnSignupUC)
	if err := consumer.SetupConsumer(); err != nil {
		log.Fatalf("Failed to set up wallet consumer: %v", err)
	}
	consumer.Listen()

	// --- temporal worker ---
	// Wallet owns the data behind its settlement steps, so its activities run in
	// this process on the `wallet` task queue (ADR-0011). Separate queues mean
	// separate activity slot pools: a degraded wallet cannot starve the steps
	// past the saga's pivot.
	temporalLogger := sdklog.NewStructuredLogger(slog.Default())

	temporalCfg, err := bstemporal.LoadConfig(bstemporal.QueueWallet)
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
		func(w worker.Worker) { services.Activities.Register(w) },
	)
	if err != nil {
		log.Fatalf("Failed to build temporal worker: %s", err)
	}
	defer temporalRunner.Stop()

	if err := temporalRunner.Start(); err != nil {
		log.Fatalf("Failed to start temporal worker: %s", err)
	}

	log.Printf("grpc Wallet Server started on PORT: %s\n", grpcAddr)

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
}
