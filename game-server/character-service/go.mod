module github.com/darkphotonKN/barrowspire-server/character-service

go 1.24.2

require (
	github.com/golang-migrate/migrate/v4 v4.17.0
	github.com/jmoiron/sqlx v1.4.0
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.10.9
)

require (
	github.com/darkphotonKN/barrowspire-server/common v0.0.0-00010101000000-000000000000
	github.com/google/uuid v1.6.0
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/rabbitmq/amqp091-go v1.10.0
	go.uber.org/atomic v1.9.0 // indirect
	golang.org/x/net v0.50.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/text v0.34.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260128011058-8636f8732409 // indirect
	google.golang.org/grpc v1.79.3
	google.golang.org/protobuf v1.36.11
)

replace github.com/darkphotonKN/barrowspire-server/common => ../common
