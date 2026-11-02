package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/config"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/upload"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonhealth "github.com/darkphotonKN/barrowspire-server/common/health"
	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	commoninterceptor "github.com/darkphotonKN/barrowspire-server/common/interceptor"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commontelemetry "github.com/darkphotonKN/barrowspire-server/common/telemetry"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	_ "github.com/joho/godotenv/autoload"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	"log/slog"
)

var (
	environment = commonhelpers.GetEnvString("ENVIRONMENT", "production")

	// observability
	collectorEndpoint = commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", "localhost:4430")
	otelEnabled       = commonhelpers.GetEnvString("OTEL_ENABLED", "true") == "true"
	serviceVersion    = commonhelpers.GetEnvString("SERVICE_VERSION", "1.0.0")

	// grpc
	serviceName = "auth"
	grpcAddr    = commonhelpers.GetEnvString("GRPC_AUTH_ADDR", "7116")

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

	// --- S3 setup ---
	s3Config := config.LoadS3Config()
	s3Client, err := config.InitS3Client(ctx, s3Config)
	if err != nil {
		log.Printf("Warning: S3 client initialization failed: %v", err)
		log.Println("Avatar upload functionality will be disabled")
		// Continue without S3 avatar uploads will not work but service runs
		s3Client = nil
	}

	// --- grpc ---
	// Recovery outermost so a panic below it still becomes a status rather than
	// killing the process; Status innermost so it sees the handler's own error.
	//
	// Without Status this service returned bare Go errors, which cross the wire as
	// codes.Unknown and land on the gateway's catch-all — a wrong password
	// answering 500 INTERNAL_ERROR instead of 401 UNAUTHENTICATED.
	grpcServer := grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler()),
		grpc.ChainUnaryInterceptor(
			commoninterceptor.Metrics(),
			commoninterceptor.Recovery(slog.Default()),
			commoninterceptor.Status(slog.Default()),
		),
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionAge:      30 * time.Second,
			MaxConnectionAgeGrace: 10 * time.Second,
		}),
	)

	// health checks for liveness probe
	pingFn := db.PingContext
	healthService := commonhealth.Register(ctx, grpcServer, pingFn)

	// reflection lets grpcurl / grpcui discover the API schema; dev only, so prod never exposes it
	if strings.EqualFold(environment, "development") {
		reflection.Register(grpcServer)
	}

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
		log.Println("Metrics server started on :8194")
		http.ListenAndServe(":8194", nil)
	}()

	// --- message broker - rabbit mq ---
	ch, brokerClose := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	broker.DeclareExchange(ch, commonconstants.AuthEventsExchange, "topic")
	defer func() {
		brokerClose()
		ch.Close()
	}()

	// --- member service setup ---
	publishCh := commonbroker.NewAmqpPublisher(ch)
	memberRepo := member.NewRepository(db)

	// --- outbox workers ---
	// The worker drains the outbox table and publishes events to RabbitMQ.
	// Without it, rows written by CreateMember would sit in the DB forever
	// and downstream services (notification, etc.) would never see the
	// event. 5s cycle keeps sign-up → notification latency small while
	// staying cheap for a low-traffic auth DB.
	outboxRepo := commonoutbox.NewRepo(db)
	outboxService := commonoutbox.NewService(outboxRepo)
	memberService := member.NewService(db, memberRepo, publishCh, outboxService)
	memberHandler := member.NewHandler(memberService)

	workersWg := sync.WaitGroup{}
	// add the number of workers
	workersWg.Add(1)
	outboxWorker := commonoutbox.NewOutboxWorker(time.Second*5, 20, outboxService, publishCh, &workersWg)

	// WARN: we pass context.Background() here to gracefully stop workers with
	// with an explicit cancel , take care not to remove that in main.go here
	workerCtx, workerCancel := context.WithCancel(context.Background())
	go outboxWorker.Run(workerCtx)

	// --- account.created consumer (FS-9KW9F) ---
	// The last hop of the loop: wallet announces a new gold account, auth caches
	// its id onto the member, and the next login mints it as a claim. Nothing
	// else writes members.account_id.
	accountRecorder := member.NewAccountRecorder(db, memberRepo, commoninbox.NewRepo())
	accountConsumer := member.NewConsumer(ch, accountRecorder)
	if err := accountConsumer.SetupConsumer(); err != nil {
		log.Fatalf("Failed to set up account.created consumer: %v", err)
	}
	accountConsumer.Listen()

	// --- upload service setup ---
	if s3Client != nil {
		uploadRepo := upload.NewRepository(db)
		logger := slog.Default()

		uploadService := upload.NewService(
			uploadRepo,
			s3Client,
			memberService,
			s3Config.BucketName,
			s3Config.CDNUrl,
			logger,
			publishCh,
			db,
		)

		uploadHandler := upload.NewHandler(uploadService)
		pb.RegisterUploadServiceServer(grpcServer, uploadHandler)
	}

	pb.RegisterAuthServiceServer(grpcServer, memberHandler)

	log.Printf("grpc Auth Server started on PORT: %s\n", grpcAddr)

	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("Can't connect to grpc server. Error:", err.Error())
		}
	}()

	<-ctx.Done() // wait for SIGTERM
	slog.Info("shutdown: signal received")

	healthService.SetServingStatus("readiness", healthpb.HealthCheckResponse_NOT_SERVING)
	time.Sleep(time.Second * 4) // let endpoint removal propogate

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

	// broker is closed by the deferred call above
	db.Close()
	slog.Info("shutdown clean")
}
