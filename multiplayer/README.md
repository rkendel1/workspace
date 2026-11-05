# Multiplayer

A real-time workspace for people and agents, built with [FeltKit](https://www.npmjs.com/package/@feltdb/feltkit) ≥ 0.3.18 (see below).
Workspaces, public and private channels, direct and group messages, threads, reactions, files, search,
presence, typing, unread counts, notifications, invitations, roles, an audit trail, and a room agent
(`@assistant`) that reads a conversation and writes a persisted project plan back into it.

All state is in one FeltDB instance per environment. Agents are participants with their own identity,
membership and permissions, and they act only through the app's capabilities.

Accounts, sign-in (password and e-mailed sign-in links), workspaces, memberships, roles, invitations,
switching and account settings are FeltKit's (`auth.accounts`, `auth.tenant`, `@feltdb/feltkit/react`):
a workspace is a FeltKit tenant, and every workspace collection is tenant-scoped. Multiplayer keeps
only its own semantics: profiles and handles, channels, DMs, private channels, what was asked of the agent.
The room agent is a FeltKit application agent (`app.agent`), message search is FeltKit's `ctx.db.search`,
files travel over FeltKit's file links, typing is an ephemeral `app.event`, and live queries re-run only
for writes that can change them (predicates on declared fields).

> **Requires FeltKit ≥ 0.3.18** (accounts, tenancy, `ctx.tenancy.members()`, `app.agent`, `ctx.db.search`,
> file links, live predicates). 0.3.18 is not published yet: `package.json` keeps `^0.3.16`, which the
> 0.3.18 release satisfies, and the lockfile is unchanged. Until then, link a local FeltKit build
> (`node_modules/@feltdb/feltkit` → FeltKit's `packages/sdk`).

![Two sessions](../docs/screenshots/04-two-sessions.png)

## Run it

Requires Node 22.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000> and sign in: with an account (password, or **E-mail me a sign-in link**:
in development the e-mail, its link and its 8-digit code are printed by `feltkit dev`), or as a
development identity (Ada, Grace, Alan). `?as=ada` signs a window in as that identity. Then create a
workspace, or choose **Open sample workspace** for Northwind Labs: four sample colleagues, a launch
discussion, a private channel, a DM, and the agent.

To be two people at once, use two browser profiles (or a private window). Invite someone by e-mail
from **＋ Invite people** (owners and admins) and open the link in their window: they sign in with the
invited address and join. Members, roles, removal, renaming and open invitations are under
**⚙ Workspace settings**; the account (name, address, password, sessions) under the name in the top bar.
The browser holds its session as FeltKit's HttpOnly cookie; nothing is kept in `localStorage`.

### The room agent

The agent runs inside the app: `app.agent("assistant", …)` in `feltkit/agents.ts`, no separate
process. A workspace admin adds it (**Add @assistant**: FeltKit's `addMember("assistant", "agent")`;
FeltKit knows the identity because the app declares the agent; agents join directly, people are
invited). In a channel, write `@assistant summarize this discussion and create a project plan.` The
person who can see the conversation brings the agent into it; `messages:send` records the request and
triggers the agent with `ctx.afterCommit.agent` in the same transaction. After the commit FeltKit runs
the handler as the agent's own principal (role `agent`, plus its membership role in that workspace,
only while it is a member there), through the same roles, tenant scoping and `authorize` as any call.
FeltKit's outbox gives the queue, lease, retries and at-most-once writes. The agent reads the
conversation, writes a `project_plan` record and replies in the thread with a link to it. Its composer
(`feltkit/_compose.ts`) is deterministic and cites the messages it used. No model is needed.

## Test it

```bash
npm test
```

That's 25 tests: functional, security and agent, each against a fresh FeltDB instance. Workspaces and
memberships are set up through FeltKit's tenancy store (`t.tenancy`), callers work in one with
`t.as(who, { tenant })`, agent runs are awaited with `t.runtime.settleAgents()`, and the role,
invitation, membership, file-link, typing-event and live-query tests go through FeltKit's real HTTP routes.

**AppBoundry is blocked (FK-GAP-013).** AppBoundry hosts have no accounts or tenancy, and
`feltkit build --target appboundry` refuses `app.agent` (it says so and builds nothing), so there is no
artifact of this app. `MP_TARGET=artifact npm test` skips every test with that reason;
`deploy/verify-appboundry.sh` and `e2e/deployment.e2e.cjs` stop at once with it (exit 2). Run Multiplayer
on FeltKit's runtime (`feltkit dev` / `feltkit start`).

```bash
node e2e/multiplayer.e2e.cjs
```

That's 21 browser checks (two desktop sessions and a phone): FeltKit sign-in, an invitation accepted with
an e-mailed sign-in code from the development inbox, switching and creating workspaces, workspace
settings (a role change and a removal taking effect), the account screen, and real-time delivery,
typing, presence, reactions, threads, a file uploaded and downloaded over file links, unread counts,
the agent, reconnection and recovery. It starts `feltkit dev` (fresh state) itself, and writes `../screenshots/phase2-multiplayer/` and
`evidence.json`.


## Layout

| Path | What it is |
|---|---|
| `feltkit/app.ts` | Roles (workspace roles are `auth.tenant` roles), accounts, tenancy, services, and the 10 collections (the data model; all but `participants` tenant-scoped) |
| `feltkit/_authz.ts` | The conversation policy, registered as `feltkit({ authorize })`: the session's workspace and role from FeltKit (a different `workspaceId` argument is refused), private channels, DMs, the agent queue, for every function on every interface (default deny), plus loaders handlers use for context |
| `feltkit/_ops.ts`, `_util.ts` | Shared write helpers (workspace entry, the directory), mention parsing |
| `feltkit/agents.ts`, `_compose.ts` | The room agent (`app.agent`) and its deterministic composer (pure) |
| `feltkit/workspaces.ts` … `agents.ts` | Queries and mutations (`<module>:<export>`), published in part as AppPort capabilities. `me:ensure` enters the session's workspace (default channels); the directory is FeltKit's members (`ctx.tenancy.members()`) joined to profiles |
| `feltkit/demo.ts` | Seeds the sample workspace (created by the client as a FeltKit tenant) |
| `src/` | React UI: `App.tsx` (which screen: FeltKit's SignIn, AcceptInvitation, CreateTenant; entering the workspace), `Workspace.tsx` (three columns, with FeltKit's TenantSwitcher, TenantSettings, InvitationsPanel, AccountSettings, AuthNotices, VerifyEmailBanner), `ui.tsx`, `styles.css` (FeltKit's components pick up its `--accent`, `--surface`, `--ink`, `--line`, `--radius`); `theme.tsx` comes from the FeltKit starter |
| `tests/` | `feltkit test` suites (`MP_TARGET=artifact`: skipped, blocked by FK-GAP-013) |
| `e2e/` | Playwright: two sessions and a phone on the dev server; deployment checks on AppBoundry (blocked by FK-GAP-013) |
| `deploy/` | Artifact verification on AppBoundry (blocked by FK-GAP-013) |

Architecture: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). The build report, the gap register
and the platform roadmap are at the repository root.
