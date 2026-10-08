package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"time"

	"github.com/darkphotonKN/barrowspire-server/character-service/config"
	"github.com/darkphotonKN/barrowspire-server/character-service/internal/character"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/common/discovery/consul"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/grpc"
)

var (
	// grpc
	serviceName = "character"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_CHARACTER_ADDR", "7123")
	consulAddr  = commonhelpers.GetEnvString("CONSUL_ADDR", "localhost:8623")

	// rabbit mq
	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
)

// openChannel opens one channel on the broker connection, exiting if it can't.
func openChannel(conn *amqp.Connection, purpose string) *amqp.Channel {
	ch, err := conn.Channel()
	if err != nil {
		slog.Error("failed to open rabbitmq channel", "purpose", purpose, "error", err)
		os.Exit(1)
	}
	return ch
}

func main() {
	// --- database setup ---

	db := config.InitDB()
	defer db.Close()

	ctx := context.Background()

	// --- message broker - rabbit mq ---
	// One connection, a channel per user: a broker error closes the channel it
	// happens on, so the service's publishing and each listener stay
	// independent of one another's failures.
	conn, err := amqp.Dial(fmt.Sprintf("amqp://%s:%s@%s:%s", amqpUser, amqpPassword, amqpHost, amqpPort))
	if err != nil {
		slog.Error("failed to connect to rabbitmq", "host", amqpHost, "port", amqpPort, "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := conn.Close(); err != nil {
			slog.Error("failed to close rabbitmq connection", "error", err)
		}
	}()

	publishCh := openChannel(conn, "publish")
	createdCh := openChannel(conn, "character created listener")
	matchEndedCh := openChannel(conn, "match ended listener")

	if err := broker.DeclareExchange(publishCh, commonconstants.CharacterCreatedEvent, "fanout"); err != nil {
		slog.Error("failed to declare exchange", "exchange", commonconstants.CharacterCreatedEvent, "error", err)
		os.Exit(1)
	}

	repo := character.NewRepository(db)
	service := character.NewService(repo, publishCh)
	handler := character.NewHandler(service)
	consumer := character.NewConsumer(service, createdCh, matchEndedCh, slog.Default())
	// declare the listeners' topology and start consuming; match.ended carries
	// each run's experience grants (FS-BDA7X §Requirements 25), so a service
	// that cannot consume it must not start
	if err := consumer.Listen(ctx); err != nil {
		slog.Error("character consumer failed to start", "error", err)
		os.Exit(1)
	}

	// --- service discovery setup ---

	// -- consul client --
	registry, err := consul.NewRegistry(consulAddr, serviceName)
	if err != nil {
		slog.Error("failed to create consul registry", "error", err)
		os.Exit(1)
	}

	instanceID := discovery.GenerateInstanceID(serviceName)

	// -- discovery --
	if err := registry.Register(ctx, instanceID, serviceName, "localhost:"+grpcAddr); err != nil {
		slog.Error("failed to register service", "error", err)
		os.Exit(1)
	}

	// -- health check --
	go func() {
		for {
			if err := registry.HealthCheck(instanceID, serviceName); err != nil {
				slog.Error("health check failed", "error", err)
				os.Exit(1)
			}
			time.Sleep(time.Second * 1)
		}
	}()

	defer registry.Deregister(ctx, instanceID, serviceName)

	// --- grpc ---
	// Status turns the domain sentinels (not found, already exists, invalid
	// input) into gRPC codes in one place.
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Recovery(slog.Default()),
			commoninterceptor.Status(slog.Default()),
		),
	)

	// create a network listener to this service
	listener, err := net.Listen("tcp", "localhost:"+grpcAddr)

	if err != nil {
		slog.Error("failed to listen", "port", grpcAddr, "error", err)
		os.Exit(1)
	}
	defer listener.Close()

	pb.RegisterCharacterServiceServer(grpcServer, handler)

	slog.Info("character grpc server started", "port", grpcAddr)

	if err := grpcServer.Serve(listener); err != nil {
		slog.Error("grpc server stopped", "error", err)
		os.Exit(1)
	}

	/*
	   // service setup
	   repo := order.NewRepository(db)
	   service := order.NewService(repo, ch)

	   // start grpc server
	   handler := order.NewGrpcHandler(service)

	   // create server
	   pb.RegisterOrderServiceServer(grpcServer, handler)

	   log.Printf("grpc Order Server started on PORT: %s\n", grpcAddr)
	   // start serving requests

	   	if err := grpcServer.Serve(l); err != nil {
	   		log.Fatal("Can't connect to grpc server. Error:", err.Error())
	   	}
	*/
}
