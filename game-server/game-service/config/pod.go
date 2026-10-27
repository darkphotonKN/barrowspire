package config

import (
	"os"
	"strconv"
	"strings"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
)

// Pod is this replica's identity: who it is to the rest of the fleet, and
// where a client must connect to reach it specifically. Fixed for the life of
// the process. FS-K2HKP §Requirements 1, FS-JEAVX §Requirements 4.
type Pod struct {
	ID   string
	Addr string

	// Name is the pod's stable name (POD_NAME, or the hostname): "game-0" in a
	// StatefulSet. Unlike ID it survives restarts, so per-pod routes use it.
	Name string

	// Generated reports that POD_ID was unset and ID is based on the hostname.
	Generated bool
}

/**
* Reads the pod identity from env, filling in local dev defaults.
*
* POD_ADDR is built from POD_ADDR_TEMPLATE, so every replica derives its own
* address from its name: {pod} is POD_NAME, {ordinal} the trailing number of
* POD_NAME ("game-2" is 2, 0 when there is none), {port} the GAME_PORT number.
* The default template follows GAME_PORT, so a second local replica on another
* port gets an address that reaches it, not the first one.
**/
func LoadPod(gamePort string) Pod {
	name := commonhelpers.GetEnvString("POD_NAME", hostnameOr(""))
	template := commonhelpers.GetEnvString("POD_ADDR_TEMPLATE", "ws://localhost:{port}/game/ws")

	pod := Pod{
		ID:   commonhelpers.GetEnvString("POD_ID", ""),
		Name: name,
		Addr: strings.NewReplacer(
			"{pod}", name,
			"{ordinal}", strconv.Itoa(ordinal(name)),
			"{port}", strings.TrimPrefix(gamePort, ":"),
		).Replace(template),
	}

	// the base is the pod's name, which a restarted pod keeps
	if pod.ID == "" {
		pod.ID = hostnameOr("pod")
		pod.Generated = true
	}

	// a short suffix generated at boot makes the id unique per process start, so a
	// restarted pod is never mistaken for the one that died: it gets no inherited
	// liveness and none of the dead process's queued players
	pod.ID = pod.ID + "-" + uuid.NewString()[:8]

	return pod
}

// ordinal is the integer after the last "-" in name ("game-2" is 2), or 0.
func ordinal(name string) int {
	i := strings.LastIndex(name, "-")
	if i < 0 {
		return 0
	}
	n, err := strconv.Atoi(name[i+1:])
	if err != nil {
		return 0
	}
	return n
}

func hostnameOr(fallback string) string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return fallback
	}
	return hostname
}
