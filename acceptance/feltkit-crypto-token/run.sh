#!/usr/bin/env bash
# Consumer acceptance for FK-GAP-010 (ctx.crypto.token): Multiplayer's invitation codes become 32-byte
# CSPRNG tokens instead of record ids, in a scratch copy, on the local FeltKit; then the same change
# as an AppBoundry artifact (needs a runtime with crypto@1; FeltKit's reference host provides it).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../multiplayer"
FELTKIT_DIR="${FELTKIT_DIR:-$HERE/../../../feltkit}"
WORK="$(mktemp -d)"
echo "== pack FeltKit ($(git -C "$FELTKIT_DIR" rev-parse --short HEAD), $(git -C "$FELTKIT_DIR" status --short | wc -l) uncommitted)"
(cd "$FELTKIT_DIR/packages/sdk" && npm pack --silent --pack-destination "$WORK" >/dev/null)
mkdir -p "$WORK/app" && (cd "$APP" && git ls-files | tar -cf - -T -) | tar -xf - -C "$WORK/app"
cd "$WORK/app"
npm install --silent --no-audit --no-fund "$(ls "$WORK"/feltdb-feltkit-*.tgz)" >/dev/null
node "$HERE/apply.mjs" "$WORK/app"
npx feltkit codegen >/dev/null && npx tsc --noEmit
echo "== Multiplayer's tests, invitation codes from ctx.crypto.token"
npx feltkit test 2>&1 | tee "$WORK/runtime.log" | grep -E "^# (pass|fail)|^not ok"
echo "== the same, against the compiled artifact"
npx feltkit build --target appboundry 2>&1 | grep -E "Artifact|crypto" || true
node -e 'const m=require("./multiplayer.app/manifest.json");console.log("manifest interfaces:", JSON.stringify(m.runtime.interfaces))'
MP_TARGET=artifact npx feltkit test 2>&1 | tee "$WORK/artifact.log" | grep -E "^# (pass|fail)|^not ok"
grep -q "^# fail 0" "$WORK/runtime.log" && grep -q "^# fail 0" "$WORK/artifact.log"
echo "OK"
