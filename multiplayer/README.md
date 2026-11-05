# Multiplayer

A real-time workspace for people and agents, built with [FeltKit](https://www.npmjs.com/package/@feltdb/feltkit) 0.3.15.
Workspaces, public and private channels, direct and group messages, threads, reactions, files, search,
presence, typing, unread counts, notifications, invitations, roles, an audit trail, and a room agent
(`@assistant`) that reads a conversation and writes a persisted project plan back into it.

All state is in one FeltDB instance per environment. Agents are participants with their own identity,
membership and permissions, and they act only through the app's capabilities.

![Two sessions](../docs/screenshots/04-two-sessions.png)

## Run it

Requires Node 22.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. In development you are signed in as Ada. Choose **Open sample workspace**
for Northwind Labs: four sample colleagues, a launch discussion, a private channel, a DM, and the agent.

To be two people at once, use two browser profiles (or a private window), with `?as=ada` and `?as=grace`.
Invite Grace from **＋ Invite people** and open the link in her window.

### The room agent

The agent is a separate process with its own agent session. It works its queue through the app's
`agent.*` capabilities:

```bash
npx feltkit session create --id assistant --type agent --role agent
```

```bash
FELTKIT_AGENT_TOKEN=fks_… MULTIPLAYER_URL=http://localhost:3000 npx tsx agent/room-agent.ts
```

In a channel, write `@assistant summarize this discussion and create a project plan.` A person who can
see the conversation brings the agent into it. The agent then reads the conversation as itself, writes
a `project_plan` record, and replies in the thread with a link to it. Its composer
(`agent/compose.ts`) is deterministic and cites the messages it used. No model is needed.

## Test it

```bash
npm test
```

That's 18 tests: functional, security and agent, each against a fresh FeltDB instance.

```bash
npx feltkit build --target appboundry && MP_TARGET=artifact npm test
```

That's the same 18 tests against the compiled AppBoundry artifact (`multiplayer.app`, WebAssembly).

```bash
node e2e/multiplayer.e2e.cjs
```

That's 16 two-session browser checks against a running `npm run dev` plus the agent process. It writes
`../docs/screenshots/` and `evidence.json`.

```bash
deploy/verify-appboundry.sh
```

This builds the artifact, serves it on the published AppBoundry runtime, and runs the deployment
browser checks, including a restart. See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

## Layout

| Path | What it is |
|---|---|
| `feltkit/app.ts` | Roles, services, and the 13 collections (the data model) |
| `feltkit/_authz.ts` | Workspace/channel authorization. Every handler that takes an id goes through it |
| `feltkit/_ops.ts`, `_util.ts`, `_base64.ts` | Shared write helpers, mention parsing, the file byte codec |
| `feltkit/workspaces.ts` … `agents.ts` | Queries and mutations (`<module>:<export>`), 11 of them published as AppPort capabilities |
| `feltkit/demo.ts` | The sample workspace |
| `agent/` | The room agent: composer (pure), queue worker (transport-independent), process (HTTP) |
| `src/` | React UI: `App.tsx` (session), `Onboarding.tsx`, `Workspace.tsx` (three columns), `ui.tsx`, `styles.css`; `auth.tsx`/`theme.tsx` come from the FeltKit starter |
| `tests/` | `feltkit test` suites (`MP_TARGET=artifact` runs them against the artifact) |
| `e2e/` | Playwright: two sessions on the dev server; deployment checks on AppBoundry |
| `deploy/` | Artifact verification on AppBoundry |

Architecture: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). The build report, the gap register
and the platform roadmap are at the repository root.
