package telemetry

import (
	"database/sql"
	"database/sql/driver"
	"errors"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
)

func gatheredNames(t *testing.T) map[string]bool {
	t.Helper()
	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	names := make(map[string]bool, len(families))
	for _, f := range families {
		names[f.GetName()] = true
	}
	return names
}

func TestDefaultRegistryKeepsGoMetricsAndAddsSchedulerLatency(t *testing.T) {
	names := gatheredNames(t)

	for _, want := range []string{
		// what the dashboards read today
		"go_goroutines",
		"go_gc_duration_seconds",
		"go_memstats_heap_inuse_bytes",
		"go_gc_gomemlimit_bytes",
		// added
		"go_sched_latencies_seconds",
		// the process collector is untouched
		"process_cpu_seconds_total",
	} {
		if !names[want] {
			t.Errorf("default registry is missing %s", want)
		}
	}
}

// nopDriver lets sql.Open hand back a *sql.DB without a server; DBStats reads
// pool counters only, so it never needs a connection.
type nopDriver struct{}

func (nopDriver) Open(string) (driver.Conn, error) { return nil, errors.New("no server") }

func TestRegisterDBStatsExportsPoolMetrics(t *testing.T) {
	sql.Register("telemetry-test-nop", nopDriver{})
	db, err := sql.Open("telemetry-test-nop", "")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	RegisterDBStats(db, "test_db")
	RegisterDBStats(db, "test_db") // a second registration logs, it does not panic

	names := gatheredNames(t)
	for _, want := range []string{
		"go_sql_open_connections",
		"go_sql_in_use_connections",
		"go_sql_idle_connections",
		"go_sql_wait_count_total",
		"go_sql_wait_duration_seconds_total",
		"go_sql_max_idle_closed_total",
		"go_sql_max_idle_time_closed_total",
		"go_sql_max_lifetime_closed_total",
	} {
		if !names[want] {
			t.Errorf("default registry is missing %s", want)
		}
	}
}
