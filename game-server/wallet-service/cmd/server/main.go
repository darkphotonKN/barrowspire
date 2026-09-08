package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"os"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/common/discovery/consul"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/config"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account"
	appConfig "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/config"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	// grpc
	serviceName = "wallet"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_WALLET_ADDR", "7128")
	consulAddr  = commonhelpers.GetEnvString("CONSUL_ADDR", "localhost:8623")

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

	// --- service discovery setup ---

	// -- consul client --
	registry, err := consul.NewRegistry(consulAddr, serviceName)
	if err != nil {
		log.Fatal("Failed to create Consul registry")
	}

	ctx := context.Background()
	instanceID := discovery.GenerateInstanceID(serviceName)

	// -- discovery --
	if err := registry.Register(ctx, instanceID, serviceName, "localhost:"+grpcAddr); err != nil {
		log.Printf("\nError when registering service:\n\n%s\n\n", err)
		panic(err)
	}

	// -- health check --
	go func() {
		for {
			if err := registry.HealthCheck(instanceID, serviceName); err != nil {
				log.Fatal("Health check failed.")
			}
			time.Sleep(time.Second * 1)
		}
	}()

	defer registry.Deregister(ctx, instanceID, serviceName)

	// --- services setup ---
	services := appConfig.NewServices(ctx, db)

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

	pb.RegisterWalletServiceServer(grpcServer, services.AccHandler)
	reflection.Register(grpcServer)

	// create a network listener to this service
	listener, err := net.Listen("tcp", "localhost:"+grpcAddr)
	if err != nil {
		log.Fatalf(
			"Failed to listen at port: %s\nError: %s\n", grpcAddr, err,
		)
	}
	defer listener.Close()

	// --- message broker - rabbit mq ---
	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	// wallet.events is a TOPIC exchange carrying every event this service
	// publishes, keyed by routing key — the convention every other service
	// follows. It replaces a fanout exchange that was named after the single
	// event it carried, which left no room for a second one.
	broker.DeclareExchange(ch, commonconstants.WalletEventsExchange, "topic")

	defer func() {
		close()
		ch.Close()
	}()

	// The outbox worker drains wallet's outbox table onto the broker. Without
	// it an account.created row is written and never published, and the claim
	// it exists to deliver never reaches auth-service.
	// The worker publishes through broker.Publisher, not a raw channel — the
	// same adapter auth-service uses, so both services publish identically.
	publishCh := broker.NewAmqpPublisher(ch)
	outboxWorker := commonoutbox.NewOutboxWorker(time.Second*5, 20, services.OutboxService, publishCh)
	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	go outboxWorker.Run(workerCtx)

	consumer := account.NewConsumer(ch, services.CreateOnSignupUC)
	if err := consumer.SetupConsumer(); err != nil {
		log.Fatalf("Failed to set up wallet consumer: %v", err)
	}
	consumer.Listen()

	log.Printf("grpc Wallet Server started on PORT: %s\n", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
