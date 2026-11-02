package outbox

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// set from the table each worker cycle, so they show the backlog even when
// the worker cannot publish (broker down) and alert on a stuck relay
var (
	unpublishedRows = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "outbox_unpublished_rows",
		Help: "Outbox rows not yet published.",
	})
	oldestUnpublishedAge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "outbox_oldest_unpublished_age_seconds",
		Help: "Age of the oldest unpublished outbox row, 0 when none are pending.",
	})
)
