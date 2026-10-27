#!/usr/bin/env bash
# Port-forwards the KinD stack to localhost for the dev:kind:a / dev:kind:b clients.
# Each forward reconnects on its own, so a deleted or restarted pod comes back
# without a manual re-forward. Ctrl-C stops them all.
#
#   gateway  localhost:7214
#   game-N   localhost:566N   (matches POD_ADDR_TEMPLATE in game-config.yaml)

set -u

forward() {
  local target=$1 ports=$2
  while true; do
    kubectl port-forward "$target" "$ports" >/dev/null 2>&1
    echo "[forward] $target dropped, reconnecting"
    sleep 1
  done
}

trap 'kill 0' EXIT

forward svc/gateway 7214:7114 &
for i in 0 1 2; do
  forward "pod/game-$i" "566$i:5668" &
done

echo "[forward] gateway :7214, game-0 :5660, game-1 :5661, game-2 :5662 (Ctrl-C to stop)"
wait
