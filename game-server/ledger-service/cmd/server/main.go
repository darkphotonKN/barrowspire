package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"os"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/common/discovery/consul"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/config"
	appConfig "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/config"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	// grpc
	serviceName = "ledger"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_LEDGER_ADDR", "7129")
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

	pb.RegisterLedgerServiceServer(grpcServer, services.LedgerHandler)
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

	broker.DeclareExchange(ch, ledger.LedgerCreatedEvent, "fanout")

	defer func() {
		close()
		ch.Close()
	}()

	// NOTE: this consumer is the seat for the event-driven write path — wallet's
	// deposit, withdraw and transfer verbs will publish events it appends from
	// (FS-0003 §Req 17). It survives the scaffold retirement even though its
	// LedgerCreatedEvent routing key does not: that constant names the retired
	// Ledger aggregate's event and gets renamed once a real event exists.
	consumer := ledger.NewConsumer(ch)
	// start goroutine and listen to events from message broker
	consumer.Listen()

	log.Printf("grpc Ledger Server started on PORT: %s\n", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	}
}
