package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/common/temporal/smoke"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/config"
	appConfig "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/config"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/adapter/itemreserver"
	listinggrpc "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/grpc"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/releasehold"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/settlement"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	sdklog "go.temporal.io/sdk/log"
	"go.temporal.io/sdk/worker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	// grpc
	grpcAddr = commonhelpers.GetEnvString("GRPC_MARKETPLACE_ADDR", "7127")

	// downstream gRPC services ("host:port")
	itemsAddr  = commonhelpers.GetEnvString("ITEMS_ADDR", "localhost:7126")
	walletAddr = commonhelpers.GetEnvString("WALLET_ADDR", "localhost:7128")

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

	// --- database setup ---

	db := config.InitDB()
	defer db.Close()

	// --- message broker - rabbit mq ---
	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	// Declare the items events exchange
	broker.DeclareExchange(ch, commonconstants.ItemEventsExchange, "topic")
	// marketplace's own events, settlement.failed first (FS-NXP1W Req 10)
	broker.DeclareExchange(ch, commonconstants.MarketplaceEventsExchange, "topic")

	defer func() {
		close()
		ch.Close()
	}()

	// --- outbox worker ---
	// Publishes what use cases wrote to the outbox in their own transaction.
	// Run loops on a ticker until ctx is cancelled, so it gets its own goroutine.
	outboxServ := commonoutbox.NewService(commonoutbox.NewRepo(db))
	outboxWorker := commonoutbox.NewOutboxWorker(time.Minute, 20, outboxServ, broker.NewAmqpPublisher(ch))
	go outboxWorker.Run(ctx)

	// --- temporal worker: initiate ---
	// Marketplace is the settlement saga's orchestrator (ADR-0011): it is the only
	// service that hosts workflows, and it also runs activities for the steps it
	// owns. Both register on the `marketplace` task queue.
	temporalLogger := sdklog.NewStructuredLogger(slog.Default())

	temporalCfg, err := bstemporal.LoadConfig(bstemporal.QueueMarketplace)
	if err != nil {
		log.Fatalf("Failed to load temporal config: %s", err)
	}

	temporalClient, err := bstemporal.Dial(ctx, temporalCfg, temporalLogger)

	if err != nil {
		log.Fatalf("Failed to connect to temporal: %s", err)
	}
	defer temporalClient.Close()

	// --- services setup ---
	itemsClient, err := itemreserver.NewClient(itemsAddr)
	if err != nil {
		log.Fatalf("Failed to create items client: %s", err)
	}
	defer func() {
		if err := itemsClient.Close(); err != nil {
			slog.Error("close items client", "error", err)
		}
	}()

	walletClient, err := listinggrpc.NewClient(walletAddr)
	if err != nil {
		log.Fatalf("Failed to create wallet client: %s", err)
	}
	defer func() {
		if err := walletClient.Close(); err != nil {
			slog.Error("close wallet client", "error", err)
		}
	}()

	services := appConfig.NewServices(ctx, db, itemsClient, walletClient, ch, temporalClient)

	// --- temporal worker: initiate ---
	// run temporal worker after with service initiated activities
	temporalRunner, err := bstemporal.NewRunner(temporalClient, temporalCfg, temporalLogger, worker.Options{},
		// testing
		smoke.RegisterWorkflow,
		smoke.RegisterActivity,

		// the workflow and every settlement activity marketplace owns
		settlement.Register,
		// gives one bid's hold back, retried until it lands
		releasehold.Register,
		func(w worker.Worker) { services.Activities.Register(w) },
		// raise and resolve for escalate and park (FS-NXP1W Req 10)
		func(w worker.Worker) { services.ExceptionActivities.Register(w) },
	)

	if err != nil {
		log.Fatalf("Failed to build temporal worker: %s", err)
	}
	// Registered after db.Close() above, so it drains ahead of the pool: an
	// activity killed mid-transaction is rescheduled, not lost, and the symptom
	// is unexplained retries after every restart.
	defer temporalRunner.Stop()

	if err := temporalRunner.Start(); err != nil {
		log.Fatalf("Failed to start temporal worker: %s", err)
	}

	// --- grpc ---

	// -- middleware --
	validate := commonauth.NewValidator([]byte(os.Getenv("JWT_SECRET")))

	// -- server --
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Recovery(slog.Default()),
			commonauth.Auth(validate),
		),
	)

	pb.RegisterMarketplaceServiceServer(grpcServer, services.ListingHandler)
	reflection.Register(grpcServer)

	// create a network listener to this service
	listener, err := net.Listen("tcp", ":"+grpcAddr)
	if err != nil {
		log.Fatalf(
			"Failed to listen at port: %s\nError: %s\n", grpcAddr, err,
		)
	}
	defer listener.Close()

	log.Printf("grpc Marketplace Server started on PORT: %s\n", grpcAddr)

	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("Can't connect to grpc server. Error:", err.Error())
		}
	}()

	<-ctx.Done() // blocks until sigint / sigterm
	stop()

	log.Println("Shutting down server")
	grpcServer.GracefulStop() // gRPC處理完目前正在執行的請求關閉
}
