#!/usr/bin/env bash
# Consumer acceptance for FK-GAP-001 (feltkit({ authorize })), without changing Multiplayer itself:
#   1. pack the local FeltKit build (FELTKIT_DIR, default ../../../feltkit)
#   2. copy multiplayer/ to a scratch directory and install that FeltKit
#   3. move Multiplayer's membership policy into one authorize hook (authorize-hook.ts) and turn
#      _authz.ts's requireWorkspace/requireChannel into plain loaders that enforce NOTHING
#   4. run Multiplayer's own 18 tests: they pass only if the hook alone enforces the policy
#   5. report the code-size difference
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../multiplayer"
FELTKIT_DIR="${FELTKIT_DIR:-$HERE/../../../feltkit}"
WORK="$(mktemp -d)"
echo "== pack FeltKit from $FELTKIT_DIR ($(git -C "$FELTKIT_DIR" rev-parse --short HEAD), $(git -C "$FELTKIT_DIR" status --short | wc -l) uncommitted)"
(cd "$FELTKIT_DIR/packages/sdk" && npm pack --silent --pack-destination "$WORK" >/dev/null)
TARBALL="$(ls "$WORK"/feltdb-feltkit-*.tgz)"
echo "== copy Multiplayer to $WORK/app"
mkdir -p "$WORK/app" && (cd "$APP" && git ls-files | tar -cf - -T -) | tar -xf - -C "$WORK/app"
cd "$WORK/app"
npm install --silent --no-audit --no-fund "$TARBALL" >/dev/null
echo "== baseline: Multiplayer's tests on this FeltKit, unchanged app"
npx feltkit codegen >/dev/null
npx feltkit test 2>&1 | grep -E "^# (pass|fail)"
cp feltkit/_authz.ts "$WORK/_authz.before.ts"
echo "== move the policy into feltkit({ authorize })"
cp "$HERE/authorize-hook.ts" feltkit/_policy.ts
node "$HERE/apply.mjs" "$WORK/app"
npx tsc --noEmit
npx feltkit test 2>&1 | tee "$WORK/after.log" | grep -E "^# (pass|fail)|^not ok"
echo "== size (cloc-free count: non-blank, non-comment lines)"
count() { grep -vE '^\s*($|//|\*|/\*)' "$1" | wc -l; }
echo "_authz.ts before: $(count "$WORK/_authz.before.ts")  after: $(count feltkit/_authz.ts)  hook (_policy.ts): $(count feltkit/_policy.ts)"
echo "authorization call sites in handlers (still present as context loaders): $(grep -ohE '\b(requireWorkspace|requireChannel)\(ctx' feltkit/*.ts | wc -l)"
grep -q "^# fail 0" "$WORK/after.log"
echo "OK: Multiplayer's 18 tests pass with the policy enforced only by feltkit({ authorize })"
