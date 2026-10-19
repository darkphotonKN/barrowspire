package broker

import (
	"reflect"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestToPublishing_MapsMessageFields(t *testing.T) {
	headers := map[string]interface{}{"x-trace": "abc"}

	tests := []struct {
		name string
		msg  Message
		want amqp.Publishing
	}{
		{
			name: "empty message id stays empty",
			msg: Message{
				ContentType:  "application/protobuf",
				Body:         []byte("payload"),
				DeliveryMode: Persistent,
			},
			want: amqp.Publishing{
				ContentType:  "application/protobuf",
				Body:         []byte("payload"),
				DeliveryMode: Persistent,
			},
		},
		{
			name: "non-empty message id is mapped",
			msg: Message{
				ContentType:  "application/protobuf",
				Body:         []byte("payload"),
				DeliveryMode: Persistent,
				MessageId:    "7f9c2b1e-0000-4000-8000-000000000001",
			},
			want: amqp.Publishing{
				ContentType:  "application/protobuf",
				Body:         []byte("payload"),
				DeliveryMode: Persistent,
				MessageId:    "7f9c2b1e-0000-4000-8000-000000000001",
			},
		},
		{
			name: "all other fields map unchanged alongside message id",
			msg: Message{
				ContentType:   "application/json",
				Body:          []byte(`{"a":1}`),
				DeliveryMode:  Transient,
				CorrelationId: "corr-1",
				Headers:       headers,
				MessageId:     "msg-1",
			},
			want: amqp.Publishing{
				ContentType:   "application/json",
				Body:          []byte(`{"a":1}`),
				DeliveryMode:  Transient,
				CorrelationId: "corr-1",
				Headers:       amqp.Table(headers),
				MessageId:     "msg-1",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := toPublishing(tt.msg)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("toPublishing() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
