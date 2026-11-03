package items

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// served on the default registry's /metrics endpoint (cmd/server)
var (
	// the free-consumable residual ADR-0040 accepts: consumed items a
	// settlement could not delete, because a later checkout reclaimed them
	// from the run fence first. Its count decides whether to build the
	// checkout upgrade early (FS-GV8WN R26).
	consumedDeleteMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "items_consumed_delete_misses_total",
		Help: "Consumed items a settlement found no longer under its run fence, so did not delete.",
	})
)
