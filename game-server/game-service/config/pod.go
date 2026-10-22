package config

import (
	"os"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
)

// Pod is this replica's identity: who it is to the rest of the fleet, and
// where a client must connect to reach it specifically. Fixed for the life of
// the process. FS-K2HKP §Requirements 1, FS-JEAVX §Requirements 4.
type Pod struct {
	ID   string
	Addr string

	// Generated reports that POD_ID was unset and ID is based on the hostname.
	Generated bool
}

/**
* Reads the pod identity from env, filling in local dev defaults.
*
* gamePort is the listen address (":5668"), so the default POD_ADDR follows
* GAME_PORT: a second local replica on another port gets an address that
* reaches it, not the first one.
**/
func LoadPod(gamePort string) Pod {
	pod := Pod{
		ID:   commonhelpers.GetEnvString("POD_ID", ""),
		Addr: commonhelpers.GetEnvString("POD_ADDR", "ws://localhost"+gamePort+"/game/ws"),
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

func hostnameOr(fallback string) string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return fallback
	}
	return hostname
}
