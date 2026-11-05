# Deploying Multiplayer

## Status

| Target | State | Evidence |
|---|---|---|
| **Managed AppBoundry on Hetzner** (approved target), `npx feltkit deploy --target appboundry` | **Blocked, not deployed.** Needs a portal URL and a deploy token. AppBoundry's own readiness document says routing/TLS is not implemented and customer execution is gated off | `✗ Deploying to AppBoundry needs APPBOUNDRY_URL (the AppBoundry portal), APPBOUNDRY_TOKEN (an AppBoundry deploy token).` The portal `https://appboundry.fly.dev` answers `401` (its contract's `AUTHENTICATION_REQUIRED`). AppBoundry `docs/feltkit-deploy-readiness.md`: "Nothing here is deployed", "Routing: designed, not implemented", "Untrusted execution in production: not ready". FK-GAP-009 |
| **The artifact on the published AppBoundry runtime** (`@appport/appboundry@1.9.0`, production environment, local FeltDB state; the artifact requires `crypto@1`, which 1.9.0 provides) | **Verified** | `deploy/verify-appboundry.sh`: 8/8 browser checks, the agent over HTTP, restart on the same state with data intact (`docs/screenshots/deployment-evidence.json`) |
| The artifact against the test suite | **Verified** | `MP_TARGET=artifact npm test`: 18/18 |

No substitute hosting was provisioned. Nothing on the shared control plane was changed. There is no
public URL.

## The artifact

```bash
cd multiplayer
```

```bash
npx feltkit build --target appboundry
```

This writes `multiplayer.app/`:

- `manifest.json`: 46 functions, 11 AppPort capabilities, 13 collections, roles, and host access.
- `module.wasm`: 3.9 MB, no imports. Host interfaces: collections, services, identity, web, transactions, and `crypto@1` (invitation codes), so it needs AppBoundry 1.9.0 or later.
- `assets/`: the hashed frontend.

The artifact runs without the source repository. AppBoundry verifies it before serving.

## Configuration and secrets

| What | Where |
|---|---|
| Deploy credential | `APPBOUNDRY_URL`, `APPBOUNDRY_TOKEN` (environment only; FeltKit never writes or prints it) |
| Identity on AppBoundry | Operators issue sessions: `appboundry admin bootstrap`, `admin users add`, `admin sessions issue`. FeltKit's self-serve accounts aren't available on AppBoundry (FK-GAP-013) |
| Room agent | A session for user `assistant` (`--type agent --role agent`), given to the agent process as `FELTKIT_AGENT_TOKEN`. It's the only secret the agent holds |
| Data | FeltDB state in the runtime's `--state` directory (local) or Managed FeltDB (`--feltdb managed`) |

The browser never receives service credentials. The build scans the frontend for server-only values.

## Deploy (when the managed target is available)

```bash
APPBOUNDRY_URL=https://<portal> APPBOUNDRY_TOKEN=<abd_…> npx feltkit deploy --target appboundry
```

```bash
npx feltkit status
```

`feltkit deploy` reports *Running* only when AppBoundry's evidence names this build's module on the
current attempt (`docs/APPBOUNDRY-DEPLOY-CONTRACT.md` in FeltKit). After that, run the room agent
anywhere with outbound HTTPS to the app:

```bash
MULTIPLAYER_URL=https://<address> FELTKIT_AGENT_TOKEN=<session> npx tsx agent/room-agent.ts
```

## Health checks and verification

- `GET /_appboundry/health` returns `{"status":"ready","module":"sha256:…"}`. Compare the module digest
  with the build's.
- `deploy/verify-appboundry.sh` runs the whole verification locally against the pinned runtime.
- `deploy/check-persisted.ts` reads the workspace, messages, attachment and plan back after a restart.

## Rollback

The steps below are what the platform documents. Only the restart on the same state was exercised here.

1. **Before an upgrade**, keep the previous `multiplayer.app` (artifacts are immutable and
   content-addressed) and export the state:
   ```bash
   appboundry admin export --state <dir> --out pre-upgrade.ndjson
   ```
2. **Managed target:** deploy the previous artifact again (`feltkit deploy --target appboundry` from
   that build). A new Running deployment supersedes the current one (AppBoundry deploy contract).
3. **Local runtime, no schema change in between:** stop the runtime and start the previous artifact on
   the same `--state`.
4. **If the new version changed the schema:** AppBoundry installs a new contract only when every record
   satisfies it, and otherwise refuses to start (`SCHEMA_INCOMPATIBLE`) while the previous version keeps
   running. If the upgrade did migrate data, restore the export into an empty directory and run the
   previous artifact there:
   ```bash
   appboundry admin restore --from pre-upgrade.ndjson --state <new-empty-dir> --artifact previous.app
   ```

## Not covered

- There's no public address, TLS or routing (AppBoundry §18, designed).
- Nothing restarts the room-agent process. It is stateless and can be supervised by anything. The
  queue it works is durable, so a restart loses nothing: an unclaimed request stays pending, and a
  claimed one is re-offered after its 2-minute lease.
- Off-host backups of AppBoundry state are designed upstream but not automated.
