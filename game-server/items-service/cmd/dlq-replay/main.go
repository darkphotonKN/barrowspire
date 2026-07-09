package main

import (
	"flag"
	"log"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
)

// var (
// 	amqpUser     = commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
// 	amqpPassword = commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
// 	amqpHost     = commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
// 	amqpPort     = commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")
// )

func main() {
	_ = godotenv.Load()
	amqpUser := commonhelpers.GetEnvString("RABBITMQ_USER", "guest")
	amqpPassword := commonhelpers.GetEnvString("RABBITMQ_PASS", "guest")
	amqpHost := commonhelpers.GetEnvString("RABBITMQ_HOST", "localhost")
	amqpPort := commonhelpers.GetEnvString("RABBITMQ_PORT", "5672")

	reason := flag.String("reason", "", "只 replay 這個 x-failure-reason,空=全部")
	limit := flag.Int("limit", 100, "單次上限")
	flag.Parse()

	ch, close := broker.Connect(amqpUser, amqpPassword, amqpHost, amqpPort)

	defer func() {
		ch.Close()
		close()
	}()

	// 啟動publish confirm, false = noWait, 執行才會收到confirm
	if err := ch.Confirm(false); err != nil {
		log.Fatal(err)
	}
	// 接收broker發送後成功或失敗
	confirms := ch.NotifyPublish(make(chan amqp.Confirmation, 1))
	// mandatory=true的時候, 代表broker發送訊息找不到對應的routing key或是失敗時會退回 returns是用來接收的chan 這樣就不會遺失
	returns := ch.NotifyReturn(make(chan amqp.Return, 1))

	replayed := 0
	// 不符合reason的先暫存不放回dlq 因為放回有可能放在第一個位置會無限循環 所以维持unacked,最後再一起放回dlq
	// crash或是出錯時channel,unacked 這些暫存的訊息會自動requeue回dlq 不會遺失
	var held []uint64
	for replayed < *limit {
		msg, ok, err := ch.Get(commonconstants.ItemsDlqQueue, false)
		if err != nil {
			log.Fatal(err)
		}
		if !ok {
			break
		}

		msgReason, _ := msg.Headers["x-failure-reason"].(string)
		if *reason != "" && msgReason != *reason {
			held = append(held, msg.DeliveryTag) // 暫存不ack或nack,留到最后统一放回
			continue
		}

		exchange, _ := msg.Headers["x-original-exchange"].(string)
		key, _ := msg.Headers["x-original-routing-key"].(string)
		// 送回原本的queue
		err = ch.Publish(exchange, key, true, false, amqp.Publishing{
			Body:         msg.Body,
			Headers:      bumpReplayCount(msg.Headers),
			DeliveryMode: amqp.Persistent,
			ContentType:  msg.ContentType,
		})
		if err != nil {
			ch.Nack(msg.DeliveryTag, false, true)
			continue
		}
		// broker的問題
		c := <-confirms
		if !c.Ack {
			ch.Nack(msg.DeliveryTag, false, true)
			continue
		}

		// 检查路由有沒有成功 路由檢查是在broker之後發生, 兩者不會重疊
		select {
		case <-returns:
			// Return表示routing key不到 , 丟回dlq
			ch.Nack(msg.DeliveryTag, false, true)
			continue
		default:
		}
		ch.Ack(msg.DeliveryTag, false)
		replayed++
	}

	// 把hold住的訊息放回dlq
	for _, tag := range held {
		if err := ch.Nack(tag, false, true); err != nil {
			slog.Error("held requeue failed", "tag", tag, "err", err)
		}
	}

	slog.Info("完成", "replayed", replayed, "held", len(held))

}

// 同一筆的回放次數累加
func bumpReplayCount(h amqp.Table) amqp.Table {
	out := amqp.Table{}
	for k, v := range h {
		out[k] = v
	}
	delete(out, "x-death")
	n, _ := out["x-replay-count"].(int32)
	out["x-replay-count"] = n + 1
	return out
}
