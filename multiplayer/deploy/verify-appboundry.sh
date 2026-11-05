#!/usr/bin/env bash
# Build the AppBoundry artifact and verify it, end to end, on the published AppBoundry runtime.
# This is NOT a Hetzner deployment (see DEPLOYMENT.md: the managed target is not available yet).
# It proves the artifact that `feltkit deploy --target appboundry` would ship actually works:
#   build → verify → run (production environment, local FeltDB state) → operator → users → sessions
#   → room agent over HTTP → two browser sessions → runtime restart on the same state → data still there.
#
#   deploy/verify-appboundry.sh            (from multiplayer/; needs Node 22 and Playwright/Chromium)
set -euo pipefail
cd "$(dirname "$0")/.."

# BLOCKED (FK-GAP-013). Multiplayer now uses FeltKit accounts and tenancy (auth.accounts, auth.tenant)
# and an application agent (app.agent "assistant"). AppBoundry hosts provide neither accounts nor
# tenancy, and `feltkit build --target appboundry` refuses app.agent, so there is no artifact to verify.
# This script is kept for when AppBoundry hosts them; it stops here instead of failing half-way.
if [[ "${FORCE_BLOCKED:-}" != "1" ]]; then
  echo "verify-appboundry.sh is blocked by FK-GAP-013: AppBoundry hosts have no accounts/tenancy and the" >&2
  echo "AppBoundry build refuses app.agent. Multiplayer runs on FeltKit's runtime (feltkit dev / start)." >&2
  exit 2
fi
RUNTIME_VERSION="${APPBOUNDRY_VERSION:-1.9.0}"
PORT="${PORT:-4100}"
WORK="$(mktemp -d)"
STATE="$WORK/state"
BASE="http://127.0.0.1:$PORT"
AB="$WORK/runtime/node_modules/.bin/appboundry"
log() { printf '\n== %s\n' "$*"; }
cleanup() { [[ -n "${RUN_PID:-}" ]] && kill "$RUN_PID" 2>/dev/null || true; [[ -n "${AGENT_PID:-}" ]] && kill "$AGENT_PID" 2>/dev/null || true; }
trap cleanup EXIT

log "build the artifact"
npx feltkit build --target appboundry

log "install the pinned runtime (@appport/appboundry@$RUNTIME_VERSION) in an empty directory"
mkdir -p "$WORK/runtime" && (cd "$WORK/runtime" && npm init -y >/dev/null && npm i --silent "@appport/appboundry@$RUNTIME_VERSION")
"$AB" --version --json | head -3
"$AB" artifact verify multiplayer.app

start() { "$AB" run multiplayer.app --state "$STATE" --environment production --port "$PORT" >"$WORK/run.log" 2>&1 & RUN_PID=$!; for _ in $(seq 1 60); do curl -sf "$BASE/_appboundry/health" >/dev/null && return; sleep 0.5; done; cat "$WORK/run.log"; exit 1; }
log "run (production environment, state in $STATE)"
start
curl -s "$BASE/_appboundry/health"; echo

log "operator, users and sessions (AppBoundry issues identity in production)"
"$AB" admin bootstrap --state "$STATE" --operator operator --name "Operator" >/dev/null
"$AB" admin users add ada --role member --name "Ada Lovelace" --state "$STATE"
"$AB" admin users add grace --role member --name "Grace Hopper" --state "$STATE"
"$AB" admin users add assistant --role agent --type agent --name "Assistant" --state "$STATE"
token() { "$AB" admin sessions issue --user "$1" --ttl 1d --state "$STATE" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token))'; }
ADA_TOKEN="$(token ada)"; GRACE_TOKEN="$(token grace)"; AGENT_TOKEN="$(token assistant)"

log "room agent process (its own agent session, over HTTP)"
FELTKIT_AGENT_TOKEN="$AGENT_TOKEN" MULTIPLAYER_URL="$BASE" npx tsx agent/room-agent.ts >"$WORK/agent.log" 2>&1 & AGENT_PID=$!
sleep 3

log "two browser sessions against the artifact"
BASE="$BASE" ADA_TOKEN="$ADA_TOKEN" GRACE_TOKEN="$GRACE_TOKEN" node e2e/deployment.e2e.cjs

log "restart the runtime on the same state; the data must still be there"
kill "$RUN_PID"; wait "$RUN_PID" 2>/dev/null || true
start
ADA_TOKEN="$ADA_TOKEN" BASE="$BASE" npx tsx deploy/check-persisted.ts

log "agent log"; cat "$WORK/agent.log"
log "OK: artifact verified on @appport/appboundry@$RUNTIME_VERSION"
