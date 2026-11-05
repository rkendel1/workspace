# FeltKit gap register

> Generated from `feltkit-gaps.json` by `node tools/gaps-md.mjs`. Edit the JSON, not this file.

Project: Multiplayer (rkendel1/workspace, multiplayer/). Platform: @feltdb/feltkit 0.3.15, create-feltkit 0.3.15, @feltdb/core 0.21.0, @appport/sdk 1.4.0, @appport/services 0.15.0, @appport/appboundry 1.8.0.

Platform source revisions read: rkendel1/feltkit@50bc617, rkendel1/appboundry@94502ef, rkendel1/appport@e9815a5, rkendel1/authboundry@b8ed659, rkendel1/appport-services@ac20b5a.

**12 gaps.** By classification: missing-extension-point 2, missing-capability 7, unsupported-requirement 1, developer-experience 2. By priority: P1 3, P2 6, P3 3.

Classifications: `missing-capability`, `missing-integration`, `missing-extension-point`, `developer-experience`, `documentation`, `unsupported-requirement`, `application-specific`. `application-specific` entries are recorded so they are *not* counted as platform overhead.

| ID | Title | Classification | Layer | Severity | Priority | Owner | Status |
|---|---|---|---|---|---|---|---|
| [FK-GAP-001](#fk-gap-001) | No application-supplied, input-aware authorization hook in FeltKit | missing-extension-point | hook | high | P1 | FeltKit (exposes AppPort's existing Authorizer composition); AppPort unchanged | open (workaround in app) |
| [FK-GAP-002](#fk-gap-002) | AuthBoundry has no resource-level evaluation, and FeltKit has no AuthBoundry adapter | missing-capability | integration | medium | P2 | AuthBoundry (evaluation); FeltKit (adapter) | open |
| [FK-GAP-003](#fk-gap-003) | No tenancy / membership primitive | missing-capability | primitive | medium | P2 | FeltKit (or AuthBoundry, if it owns tenancy) | open (workaround in app) |
| [FK-GAP-004](#fk-gap-004) | No ephemeral / broadcast real-time primitive (presence, typing) | missing-capability | primitive | medium | P2 | FeltKit (server + client); AppBoundry host interface for parity | open (workaround in app) |
| [FK-GAP-005](#fk-gap-005) | Live-query invalidation is per collection, not per query predicate | missing-capability | primitive | medium | P2 | FeltKit (change feed); FeltDB (F7 change listener naming keys) | open |
| [FK-GAP-006](#fk-gap-006) | No text search / contains operator in ctx.db.query | missing-capability | primitive | low | P3 | FeltDB (index), FeltKit (exposure) | open (workaround in app) |
| [FK-GAP-007](#fk-gap-007) | Files are application-shared; per-resource file access must be bound by the app | missing-extension-point | integration | medium | P2 | AppPort Services (authorization by metadata, signed URLs); FeltKit (route) | open (workaround in app) |
| [FK-GAP-008](#fk-gap-008) | No hosted, event-triggered execution for application agents | missing-capability | primitive | high | P1 | FeltKit + AppBoundry (execution); FeltDB agent state | open (workaround in app) |
| [FK-GAP-009](#fk-gap-009) | AppBoundry deployment (Hetzner) is not available to an application | unsupported-requirement | deployment | high | P1 | AppBoundry | blocking deployment acceptance |
| [FK-GAP-010](#fk-gap-010) | No secure token / random primitive for application bearer secrets | missing-capability | primitive | medium | P2 | FeltKit + AppBoundry host ABI | open (limitation documented) |
| [FK-GAP-011](#fk-gap-011) | Client reconnect waits out exponential backoff (up to 10 s) after the network returns | developer-experience | client | low | P3 | FeltKit client | open |
| [FK-GAP-012](#fk-gap-012) | Capabilities require hand-written output schemas even when the handler's return type is known | developer-experience | dx | low | P3 | FeltKit | accepted (by design) |

## FK-GAP-001

### No application-supplied, input-aware authorization hook in FeltKit

Discovered 2026-11-05 · missing-extension-point · hook · severity high · P1 · open (workaround in app)

**Components:**

- rkendel1/feltkit (packages/sdk/src/runtime/authority.ts, app.ts)
- @appport/authorization

**Description:** FeltKit evaluates every boundary (HTTP functions, /appport, MCP, Services) through one AppPort Authorizer built from application-wide roles. An application cannot add a policy that decides on the call's input ("may this caller act on workspace W / channel C"). AppPort already supports exactly this: AuthorizationRequest carries the validated `input` 'so policies can make resource-aware decisions', and combineAuthorizers/authorizerFrom compose policies. FeltKit does not expose it.

**Evidence:**

- @feltdb/feltkit 0.3.15 dist/app.d.ts: FeltKitOptions has roles, auth.authenticate, dev, services, agent, activity; no authorize/authorizer option
- @feltdb/feltkit dist/runtime/authority.d.ts: Authority(applicationId, roles) — role → permission only; authorize({access, principal, target, transport, input}) receives input but evaluates permissionAuthorizer
- @appport/authorization dist/index.d.ts: AuthorizationRequest.input ('Validated capability input, so policies can make resource-aware decisions'); combineAuthorizers; authorizerFrom
- @appport/authorization: AuthorizationContext doc: 'Handlers use it for resource-level checks that the declarative capability permissions cannot express'

**What the developer wanted:** Declare once, beside roles, that functions taking a workspaceId/channelId/messageId require membership, and have the decision recorded by AppPort with a decision id on every interface.

**What the platform provides:** Role/permission checks at every boundary; ctx.auth.require(permission) inside handlers.

**Implemented manually:** feltkit/_authz.ts: loads the target record from the id the client sent, resolves the caller's participant and membership, and refuses NOT_FOUND/FORBIDDEN. Called at the top of every handler that takes an id.

**Workaround:** Centralized helper module called explicitly by each handler; transport-independent (runs inside the function, so HTTP, AppPort and MCP calls all pass through it).

**Custom LOC attributable:** measured in the build report (multiplayer/feltkit/_authz.ts plus one call per handler)

**Engineering time attributable:** 2-3 (hook design in app) — see report

**If the platform provided it:** Relocates, does not disappear: membership policy is application-specific and would move from handler preambles into one registered authorizer. The per-handler calls and the duplicated 'load record → find workspace' plumbing disappear; denials gain AppPort decision ids and activity evidence.

**Proposed change:** feltkit({ authorize: Authorizer | (req: { principal, function, capability, input, db }) => Decision }) composed after the role authorizer with combineAuthorizers, given a read-only db handle on the same instance, applied identically at HTTP, AppPort, MCP and Services boundaries, and recorded like role denials. Per-function opt-in: app.query({ access, resource: (args) => ({ type: 'channel', id: args.channelId }) }).

**Architectural owner:** FeltKit (exposes AppPort's existing Authorizer composition); AppPort unchanged

**Dependencies:** none

## FK-GAP-002

### AuthBoundry has no resource-level evaluation, and FeltKit has no AuthBoundry adapter

Discovered 2026-11-05 · missing-capability · integration · severity medium · P2 · open

**Components:**

- rkendel1/authboundry (docs/ENFORCEMENT.md)
- rkendel1/feltkit (docs/AGENT-OPERATIONS.md §PR 4)

**Description:** AuthBoundry models tenancy, principals, agents and delegation, but its enforcement contract evaluates at capability granularity only: `resource` is recorded as evidence, not evaluated. FeltKit has no adapter to AuthBoundry at all (no source references to @authboundry); the adapter is a planned step blocked on verifying a published release.

**Evidence:**

- authboundry docs/ENFORCEMENT.md 'Not covered yet': 'Resource-level evaluation. `resource` is recorded as evidence. Application decisions are evaluated at capability granularity'
- feltkit docs/AGENT-OPERATIONS.md: '4: AuthBoundry adapter … whether delegations, agent credentials and runs under a delegation are in 1.15.3 is unverified'
- grep -r @authboundry packages/sdk/src → no matches (FeltKit 50bc617)

**What the developer wanted:** Tenant (workspace) membership and per-resource decisions owned by the authority boundary, with delegation for agents acting for a person.

**What the platform provides:** Nothing reachable from a FeltKit app.

**Implemented manually:** Same code as FK-GAP-001 (_authz.ts) plus app-owned memberships collection.

**Workaround:** Application-owned membership records in FeltDB; app-level checks.

**Custom LOC attributable:** shared with FK-GAP-001 (not double-counted)

**Engineering time attributable:** shared with FK-GAP-001

**If the platform provided it:** Would move membership records and policy to AuthBoundry; requires FK-GAP-001's hook as the integration point.

**Proposed change:** AuthBoundry: evaluate `resource` against tenant membership/relationship policy. FeltKit: an AuthBoundry Authorizer adapter plugged in through FK-GAP-001's hook.

**Architectural owner:** AuthBoundry (evaluation); FeltKit (adapter)

**Dependencies:** FK-GAP-001

## FK-GAP-003

### No tenancy / membership primitive

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · open (workaround in app)

**Components:**

- rkendel1/feltkit

**Description:** FeltKit roles are application-wide: a principal holds the same roles everywhere. Multi-tenant apps (workspaces, organizations, projects) must model tenants, memberships, per-tenant roles and invitations themselves.

**Evidence:**

- feltkit README 'Identity and authority': roles map to permission strings for the whole application
- docs/GUARANTEES.md: 'FeltKit is single-tenant per application'

**What the developer wanted:** Workspaces with per-workspace roles and invitations.

**What the platform provides:** Accounts, sessions, application-wide roles.

**Implemented manually:** workspaces, memberships, invitations collections and their functions.

**Workaround:** Application collections.

**Custom LOC attributable:** measured in report (data model + invitations/workspaces modules)

**Engineering time attributable:** see report

**If the platform provided it:** Partly application-specific (what a workspace is), partly reusable (membership, role-in-tenant, invitation lifecycle). A primitive would remove the reusable part.

**Proposed change:** Optional `app.tenancy({ collection, roles })` primitive: membership + invitation records and a `ctx.tenant` resolved per call, feeding FK-GAP-001.

**Architectural owner:** FeltKit (or AuthBoundry, if it owns tenancy)

**Dependencies:** FK-GAP-001

## FK-GAP-004

### No ephemeral / broadcast real-time primitive (presence, typing)

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · open (workaround in app)

**Components:**

- rkendel1/feltkit (runtime/changes.ts, /api/events)

**Description:** The only real-time channel is the change stream: it carries the names of collections FeltDB committed to, and clients re-run queries. Nothing carries short-lived state that should not be a durable commit (presence, typing, cursors).

**Evidence:**

- packages/sdk/src/runtime/changes.ts header: change feed read from FeltDB's operation journal, events name collections
- packages/sdk/src/client/index.ts #connect: SSE events 'change' {collections}, 'ready', 'reload' only
- grep presence|ephemeral|broadcast|typing in packages/sdk/src → none

**What the developer wanted:** Presence and typing indicators that are not durable records.

**What the platform provides:** Durable writes + live queries.

**Implemented manually:** presence collection: one overwritten record per (workspace, participant), heartbeat and typing mutations; client-side expiry.

**Workaround:** Bounded durable record (never grows), so delivery works on every FeltKit target including AppBoundry without a second transport. Cost: each heartbeat/keystroke burst is a FeltDB commit and an activity entry, and every client watching presence re-queries.

**Custom LOC attributable:** measured in report (presence.ts + client hooks)

**Engineering time attributable:** see report

**If the platform provided it:** Mostly disappears: a platform `ctx.ephemeral.publish(topic, value, { ttl })` with authorized subscription would replace the collection, heartbeat mutation and expiry logic; the UI stays.

**Proposed change:** An authorized ephemeral channel on the existing /api/events stream: publish(topic, payload, ttl) from functions, subscribe(topic) from clients, topics authorized by FK-GAP-001's hook; never written to FeltDB.

**Architectural owner:** FeltKit (server + client); AppBoundry host interface for parity

**Dependencies:** FK-GAP-001 (topic authorization)

## FK-GAP-005

### Live-query invalidation is per collection, not per query predicate

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · open

**Components:**

- rkendel1/feltkit (client watchQuery, runtime/changes.ts)
- FeltDB F7 (no database-level change listener)

**Description:** A query re-runs when any record in any collection it read changes. One message in #random re-runs every open channel's message query, every thread and every unread count, for every connected client.

**Evidence:**

- packages/sdk/src/client/index.ts watchQuery: reruns when `collections.some((c) => reads.has(c))`
- README 'Live queries': 'streams the names of changed collections'

**What the developer wanted:** Clients notified only when their channel changes.

**What the platform provides:** Collection-level invalidation, at-least-once within ~150 ms (local) / ~1 s (FeltDB server).

**Implemented manually:** Nothing (accepted); recorded as a scaling limit.

**Workaround:** None needed at demo scale. Mitigation would be one collection per channel, which FeltKit's schema model does not allow dynamically.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0

**If the platform provided it:** n/a

**Proposed change:** Carry equality predicates (collection + indexed field values) in the change event and in a query's recorded reads, so watchQuery matches on (collection, channelId).

**Architectural owner:** FeltKit (change feed); FeltDB (F7 change listener naming keys)

**Dependencies:** none

## FK-GAP-006

### No text search / contains operator in ctx.db.query

Discovered 2026-11-05 · missing-capability · primitive · severity low · P3 · open (workaround in app)

**Components:**

- rkendel1/feltkit (runtime/data.ts WhereClause)
- FeltDB query

**Description:** WhereClause supports eq, neq, lt, lte, gt, gte only. Message search has to read the workspace's messages and filter in the handler.

**Evidence:**

- packages/sdk/src/runtime/data.ts:50 interface WhereClause { field; eq; neq; lt; lte; gt; gte }

**What the developer wanted:** Search messages across the conversations the caller can read.

**What the platform provides:** Equality/range queries.

**Implemented manually:** messages:search scans the workspace's messages, filters by readable channels and a case-insensitive substring match.

**Workaround:** Bounded scan in the handler (O(messages in workspace)).

**Custom LOC attributable:** measured in report (search handler)

**Engineering time attributable:** see report

**If the platform provided it:** Filtering by readable channels stays (authorization); the scan and matching would disappear with an indexed text predicate.

**Proposed change:** A `contains`/`prefix` predicate and an optional text index declaration in app.collection(..., { search: ['text'] }).

**Architectural owner:** FeltDB (index), FeltKit (exposure)

**Dependencies:** none

## FK-GAP-007

### Files are application-shared; per-resource file access must be bound by the app

Discovered 2026-11-05 · missing-extension-point · integration · severity medium · P2 · open (workaround in app)

**Components:**

- rkendel1/feltkit (runtime/services.ts)
- @appport/services Files

**Description:** Any principal with files.read can read every file. Attaching a file to a conversation, and authorizing reads by that conversation, is the application's job. There is also no browser download/upload route for files: bytes cross the function API (base64 in JSON).

**Evidence:**

- feltkit docs/GUARANTEES.md:269 'Files are application-shared: any principal with files.read reads every file.'
- runtime/services.ts FilesWriter.upload(content: string | Uint8Array); maxBytes 1 MiB default (GUARANTEES.md:156)
- server/*: no /api/files route; admin.ts file routes are behind the admin token

**What the developer wanted:** Upload a file into a channel; only channel members can download it.

**What the platform provides:** Files service: upload/list/get/read/remove with metadata, authorized by app-wide permission.

**Implemented manually:** attachments collection binding fileId → channel; upload/download functions with membership checks; base64 transfer.

**Workaround:** Bind in app; transfer base64 through functions (1 MiB cap).

**Custom LOC attributable:** measured in report

**Engineering time attributable:** see report

**If the platform provided it:** Binding record stays (it's app semantics); base64 plumbing disappears with a signed download URL; the authorization moves into FK-GAP-001's hook if Files consulted it.

**Proposed change:** Files: authorize reads through the app's resource authorizer (metadata-based), and a signed, short-lived download/upload URL issued by a function.

**Architectural owner:** AppPort Services (authorization by metadata, signed URLs); FeltKit (route)

**Dependencies:** FK-GAP-001

## FK-GAP-008

### No hosted, event-triggered execution for application agents

Discovered 2026-11-05 · missing-capability · primitive · severity high · P1 · open (workaround in app)

**Components:**

- rkendel1/feltkit (runtime/agent.ts, ctx.agent)
- AppBoundry (refuses ctx.agent)

**Description:** FeltKit's agent decides among options a mutation offers (ctx.agent.start) or works operator tasks in Studio; external agents connect over MCP with a session. There is no way for an application to run its own room agent in response to an event (a mention) under the agent's own identity. ctx.agent is refused by the AppBoundry build.

**Evidence:**

- README 'Agents': 'There is no planner: playbooks choose capabilities by code, models choose among options code built, and open-ended work is an external agent's.'
- README AppBoundry: build refuses ctx.agent
- jobs run 'as the principal that created them' (README Services) — a job queued by a person runs with the person's authority, not the agent's

**What the developer wanted:** @assistant mention → the agent reads the conversation and acts, as itself, through the app's capabilities.

**What the platform provides:** Agent sessions (feltkit session create --type agent), capabilities over AppPort/MCP, the change stream.

**Implemented manually:** agentRequests queue (durable), agent:* capabilities (pending/claim/context/respond), and an external worker process (agent/room-agent.ts) authenticated with an agent session.

**Workaround:** External worker adapter. Durable queue makes it crash-safe; the worker holds no state.

**Custom LOC attributable:** measured in report

**Engineering time attributable:** see report

**If the platform provided it:** Queue/claim/lease plumbing disappears with a platform 'agent trigger' (run handler X as principal P when event E). The agent's behaviour (compose summary/plan) stays application code.

**Proposed change:** app.agent('assistant', { principal, roles, on: 'messages.mention', handler }) executed by FeltKit's runtime (and AppBoundry's) as the agent principal, with at-least-once delivery and leases.

**Architectural owner:** FeltKit + AppBoundry (execution); FeltDB agent state

**Dependencies:** none

## FK-GAP-009

### AppBoundry deployment (Hetzner) is not available to an application

Discovered 2026-11-05 · unsupported-requirement · deployment · severity high · P1 · blocking deployment acceptance

**Components:**

- rkendel1/appboundry (docs/feltkit-deploy-readiness.md)
- rkendel1/feltkit (feltkit deploy --target appboundry)

**Description:** The FeltKit → AppBoundry deploy contract is implemented and tested locally on both sides but explicitly not deployed: routing/TLS not implemented (address null), customer execution gated off (verified-runtime policy empty), no deploy token issued.

**Evidence:**

- appboundry docs/feltkit-deploy-readiness.md: 'Nothing here is deployed'; Routing 'designed, not implemented'; 'Untrusted execution in production: not ready'
- feltkit docs/APPBOUNDRY-DEPLOY-CONTRACT.md: 'not deployed'
- No APPBOUNDRY_URL / APPBOUNDRY_TOKEN in this environment

**What the developer wanted:** A working public URL on the approved Hetzner target.

**What the platform provides:** feltkit build --target appboundry (artifact) and @appport/appboundry run (local runtime).

**Implemented manually:** Nothing (not substituted).

**Workaround:** Build the artifact and verify it on the published AppBoundry runtime locally; no invented deployment.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0

**If the platform provided it:** n/a

**Proposed change:** Ship AppBoundry routing (§18), pin a verified runtime, issue a scoped deploy token.

**Architectural owner:** AppBoundry

**Dependencies:** none

## FK-GAP-010

### No secure token / random primitive for application bearer secrets

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · open (limitation documented)

**Components:**

- rkendel1/feltkit (runtime/data.ts newId)
- AppBoundry guest (no ambient capabilities)

**Description:** Invitation links need an unguessable code. Record ids are `Date.now().toString(36) + randomBytes(6)` (48 random bits, timestamp prefix), and ctx offers no CSPRNG or token issuer that is guaranteed on both FeltKit's runtime and the AppBoundry WebAssembly guest (which removes ambient globals).

**Evidence:**

- node_modules/@feltdb/feltkit/dist/runtime/data.js: export function newId() { return `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`; }
- appboundry docs/feltkit-deploy-readiness.md §3: guest has no ambient capability; host ABI is a closed set (db.*, outbox.stage, AppPort Services)

**What the developer wanted:** Invitation codes with >=128 bits of entropy, revocable, single use, that work on every runtime.

**What the platform provides:** Record ids (48 random bits). Sessions/API keys exist but are for principals, not app-level links.

**Implemented manually:** Invitation = record id used as the code; single use, 7-day expiry, revocable, audited.

**Workaround:** Accepted 48-bit codes, documented as a known limitation; mitigated by expiry, single use and revocation (no rate limiting).

**Custom LOC attributable:** 0 extra (limitation accepted)

**Engineering time attributable:** 0.5 (investigation)

**If the platform provided it:** Invitation code generation would become one platform call; the invitation lifecycle stays app code.

**Proposed change:** ctx.crypto.token(bytes=32) (host-provided CSPRNG in both runtimes), or a platform 'link token' primitive: issue/verify/revoke a signed, expiring, single-use token bound to a record.

**Architectural owner:** FeltKit + AppBoundry host ABI

**Dependencies:** none

## FK-GAP-011

### Client reconnect waits out exponential backoff (up to 10 s) after the network returns

Discovered 2026-11-05 · developer-experience · client · severity low · P3 · open

**Components:**

- rkendel1/feltkit (packages/sdk/src/client/index.ts #connect)

**Description:** After a network loss the change stream retries with backoff 0.5 s → 10 s and does not listen for the browser's online event, so a client that comes back online can wait up to ~10 s (measured 6.4–16 s in e2e) before re-querying. Durable recovery itself is correct: on reconnect every query re-runs.

**Evidence:**

- client/index.ts #connect: delay = Math.min(delay * 2, 10_000); no 'online' listener
- docs/screenshots/evidence.json: 'reconnection: offline session catches up' 6415 ms and 15963 ms in two runs

**What the developer wanted:** Catch up within ~1 s of the network returning.

**What the platform provides:** Correct but slow catch-up.

**Implemented manually:** Nothing (accepted).

**Workaround:** None.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.25 (diagnosis)

**If the platform provided it:** n/a

**Proposed change:** Reset the backoff and reconnect on window 'online' and on visibilitychange→visible.

**Architectural owner:** FeltKit client

**Dependencies:** none

## FK-GAP-012

### Capabilities require hand-written output schemas even when the handler's return type is known

Discovered 2026-11-05 · developer-experience · dx · severity low · P3 · accepted (by design)

**Components:**

- rkendel1/feltkit (runtime/loader.ts)

**Description:** Publishing a function as an AppPort capability requires `returns`; the loader refuses otherwise ('needs a returns schema: AppPort publishes and enforces its output contract'). This is a deliberate, correct contract rule with a clear error, but the schema restates what the TypeScript handler already returns. Classified as DX, not a defect.

**Evidence:**

- FeltKitError CONFIGURATION: Capability "agent.pending" needs a `returns` schema

**What the developer wanted:** Publish agent.* capabilities.

**What the platform provides:** Clear error; s.doc(collection) helps for stored records.

**Implemented manually:** Return schemas for agent.pending/claim/context/fail and plans.get (~15 lines).

**Workaround:** Write the schemas.

**Custom LOC attributable:** ~15

**Engineering time attributable:** 0.25

**If the platform provided it:** Would shrink if returns could be derived from collection docs plus picks automatically; the contract itself should stay explicit.

**Proposed change:** None required; optionally a codegen hint that drafts the schema from the handler's inferred type.

**Architectural owner:** FeltKit

**Dependencies:** none
