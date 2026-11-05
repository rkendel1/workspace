# FeltKit gap register

> Generated from `feltkit-gaps.json` by `node tools/gaps-md.mjs`. Edit the JSON, not this file.

Project: Multiplayer (rkendel1/workspace, multiplayer/). Platform: @feltdb/feltkit 0.3.16, create-feltkit 0.3.16, @feltdb/core 0.21.0, @appport/sdk 1.4.0, @appport/services 0.15.0, @appport/appboundry 1.9.0, @appport/sdk (released, not yet used by FeltKit 0.3.16) 1.5.0, @appport/server (released, not yet used by FeltKit 0.3.16) 1.2.0.

Platform source revisions read: rkendel1/feltkit@b349543 (main; includes f20ed78, 7f8e71d, a65a38e), rkendel1/appport@c637e8e (main; includes f1f8c21), rkendel1/appboundry@7dc1510 (main; includes c925d91), rkendel1/authboundry@b8ed659, rkendel1/appport-services@ac20b5a, work in progress (local, not pushed)@[object Object].

**Gap-to-code accounting:** ≈550 code lines (≈22% of custom code); the attributions overlap slightly (FK-GAP-001 call sites sit inside modules also attributed to FK-GAP-003/007/008), deduplicated ≈520. ≈370 code lines (≈15%) if FK-GAP-001, -003, -004, -006, -007, -008 were closed; the rest relocates or is application semantics. Method: cloc 2.00 on each file (tools/measure.mjs); function-level counts by non-blank, non-comment lines of the named exports.

**21 gaps.** By classification: missing-extension-point 3, missing-capability 10, unsupported-requirement 1, developer-experience 3, missing-integration 4. By priority: P1 7, P2 9, P3 5.

Classifications: `missing-capability`, `missing-integration`, `missing-extension-point`, `developer-experience`, `documentation`, `unsupported-requirement`, `application-specific`. `application-specific` entries are recorded so they are *not* counted as platform overhead.

| ID | Title | Classification | Layer | Severity | Priority | Owner | Status |
|---|---|---|---|---|---|---|---|
| [FK-GAP-001](#fk-gap-001) | No application-supplied, input-aware authorization hook in FeltKit | missing-extension-point | hook | high | P1 | FeltKit (exposes AppPort's existing Authorizer composition); AppPort unchanged | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |
| [FK-GAP-002](#fk-gap-002) | AuthBoundry has no resource-level evaluation, and FeltKit has no AuthBoundry adapter | missing-capability | integration | medium | P2 | AuthBoundry (evaluation); FeltKit (adapter) | open — FeltKit integration point now exists (feltkit({ authorize })); AuthBoundry resource evaluation still missing |
| [FK-GAP-003](#fk-gap-003) | No tenancy / membership primitive | missing-capability | primitive | medium | P2 | AuthBoundry (membership as delegation), with FeltKit integration through FK-GAP-001/002 — not a FeltKit membership store | open — reassigned to AuthBoundry; FeltKit side now available (authorize hook) |
| [FK-GAP-004](#fk-gap-004) | No ephemeral / broadcast real-time primitive (presence, typing) | missing-capability | primitive | medium | P2 | AppPort (events: authorization + scope) first; then FeltKit integration (ctx publish + client subscribe on AppPort events) | implemented across AppPort, FeltKit and AppBoundry (local branches); Multiplayer adoption blocked on the AppPort release |
| [FK-GAP-005](#fk-gap-005) | Live-query invalidation is per collection, not per query predicate | missing-capability | primitive | medium | P2 | FeltKit (change feed); FeltDB (F7 change listener naming keys) | open |
| [FK-GAP-006](#fk-gap-006) | No text search / contains operator in ctx.db.query | missing-capability | primitive | low | P3 | FeltDB (index), FeltKit (exposure) | open (workaround in app) |
| [FK-GAP-007](#fk-gap-007) | Files are application-shared; per-resource file access must be bound by the app | missing-extension-point | integration | medium | P2 | AppPort Services (authorization by metadata, signed URLs); FeltKit (route) | implemented in FeltKit (branch claude/file-links, local, not pushed); Multiplayer adoption awaits release |
| [FK-GAP-008](#fk-gap-008) | No hosted, event-triggered execution for application agents | missing-capability | primitive | high | P1 | FeltKit + AppBoundry (execution); FeltDB agent state | open (workaround in app) |
| [FK-GAP-009](#fk-gap-009) | AppBoundry deployment (Hetzner) is not available to an application | unsupported-requirement | deployment | high | P1 | AppBoundry | blocking deployment acceptance |
| [FK-GAP-010](#fk-gap-010) | No secure token / random primitive for application bearer secrets | missing-capability | primitive | medium | P2 | FeltKit (ctx.crypto) + AppBoundry (host interface crypto@1) — each in its own repository | closed — released in @feltdb/feltkit 0.3.16 and @appport/appboundry 1.9.0 (crypto@1); adopted by Multiplayer (workaround removed) |
| [FK-GAP-011](#fk-gap-011) | Client reconnect waits out exponential backoff (up to 10 s) after the network returns | developer-experience | client | low | P3 | FeltKit client | implemented (FeltKit 40ba4ad, local); awaiting review/release; Multiplayer e2e catch-up to be re-measured on release |
| [FK-GAP-012](#fk-gap-012) | Capabilities require hand-written output schemas even when the handler's return type is known | developer-experience | dx | low | P3 | FeltKit | accepted (by design) |
| [FK-GAP-013](#fk-gap-013) | FeltKit built-in accounts (sign-up / sign-in) are not available when the artifact runs on AppBoundry | missing-integration | integration | high | P1 | AppBoundry (identity host interface); AuthBoundry as the eventual identity owner | open (blocks self-serve onboarding on the approved target) |
| [FK-GAP-014](#fk-gap-014) | MCP endpoint (and Studio) are not part of the artifact; agents on AppBoundry use HTTP only | missing-integration | integration | medium | P2 | AppBoundry (web interface); AppPort (MCP transport) | open |
| [FK-GAP-015](#fk-gap-015) | Two AppBoundry artifact formats and runtime paths: repository bundles (appport add) and FeltKit artifacts are not interchangeable | missing-integration | architecture | medium | P2 | AppBoundry (artifact contract); AppPort (packager); FeltKit (producer) | open |
| [FK-GAP-016](#fk-gap-016) | `npx appport add` is interactive-only and needs a Rust wasm32 toolchain | developer-experience | dx | low | P3 | AppPort CLI | closed in code (AppBoundry 5b1e311, local): the gap was smaller than recorded |
| [FK-GAP-017](#fk-gap-017) | AppPort delivered events a session may not observe (wildcard subscriptions; subscriptions bypassed the application Authorizer) | missing-capability | security | high | P1 | AppPort | closed — released in AppPort (@appport/protocol 1.4.0, core 1.6.0, server 1.2.0, sdk 1.5.0, authorization 1.0.8) |
| [FK-GAP-018](#fk-gap-018) | AppPort decisions cannot conceal existence (no NOT_FOUND denial) | missing-extension-point | contract | low | P3 | AppPort | implemented (AppPort 81ba58f + FeltKit 3abc1bd, local); awaiting review/release |
| [FK-GAP-019](#fk-gap-019) | @appport/core 1.6.0 is not portable: a test-only barrier imports node:fs/node:path at load | missing-capability | defect | high | P1 | AppPort | fixed in AppPort (66a7874, local) with a portability test over core's import graph; needs core 1.6.1 |
| [FK-GAP-020](#fk-gap-020) | AppPort: subscriptions from different connections with the same subscriptionId replaced each other | missing-capability | defect | high | P1 | AppPort | fixed in AppPort (ada9157, local); needs a server release |
| [FK-GAP-021](#fk-gap-021) | @appport/resolver-client pins @appport/sdk 1.4.0 (and the resolver server pins @appport/server 1.1.5) | missing-integration | dependency | medium | P2 | Resolver | fixed in rkendel1/resolver (c61fe14, local; tests 173 passed/9 skipped, unchanged); needs a release |

## FK-GAP-001

### No application-supplied, input-aware authorization hook in FeltKit

Discovered 2026-11-05 · missing-extension-point · hook · severity high · P1 · closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed)

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

**Implemented manually:** Nothing beyond the application's own policy (feltkit/_authz.ts `authorize`), which belongs to the application.

**Workaround:** Removed (2026-11-05).

**Custom LOC attributable:** 51 (feltkit/_authz.ts) + 43 call sites in handlers = ~94 code lines. Of these ~20 lines of plumbing (load record → resolve workspace → find membership) and the 43 call sites would disappear; ~30 lines of membership policy are application-specific and would relocate into the registered authorizer. — MEASURED after the primitive (consumer run): net +39 lines; 37 call sites remain as loaders. See resolution.measuredEffect.

**Engineering time attributable:** 2–3 h (design + every handler + 9 security tests' worth of cases)

**Kind of code:** platform integration glue (call sites, plumbing) + application policy (rules)

**If the platform provided it:** Relocates and gains guarantees; does not shrink Multiplayer (measured).

**Proposed change:** feltkit({ authorize: Authorizer | (req: { principal, function, capability, input, db }) => Decision }) composed after the role authorizer with combineAuthorizers, given a read-only db handle on the same instance, applied identically at HTTP, AppPort, MCP and Services boundaries, and recorded like role denials. Per-function opt-in: app.query({ access, resource: (args) => ({ type: 'channel', id: args.channelId }) }).

**Architectural owner:** FeltKit (exposes AppPort's existing Authorizer composition); AppPort unchanged

**Dependencies:** none

#### Platform work (2026-11-05)

**What was missing:** A way for an application to supply an input-aware decision composed with FeltKit's role policy at every boundary.

**What existed already:** AppPort's Authorizer contract already carries the validated input ('so policies can make resource-aware decisions') and AuthorizationDecision; FeltKit's Authority already passed `input` but evaluated roles only. Every interface (HTTP /api, AppPort, MCP, agent actions, jobs) already funnels into Runtime#call; the AppBoundry guest has the same call path.

**Reused:**

- @appport/authorization AuthorizationDecision (return type)
- Runtime#call (single execution boundary)
- the call's own ctx.db reader (read fences at commit; live-query read set)
- FeltKit activity record (authority.*)
- isFeltKitError brand check

**Implemented:**

- src/authorize.ts: AuthorizeHook/AuthorizeRequest/AuthorizeResult, evaluateAuthorize (fail closed, read-only db view) — runtime-neutral, shared by runtime and guest
- FeltKitOptions.authorize
- Runtime#call: hook after roles + validation, before the handler, inside each attempt (re-evaluated on sequence retries); authority.resource recorded
- AppBoundry guest: the same hook at the same point
- Docs: README, GUARANTEES (table), CHANGELOG, feltkit-build skill; UPSTREAM-GAPS A8/A9

**Public API:** feltkit({ authorize?: (req: { function, kind, access, capability?, principal, args, transport, requestId, db }) => boolean | AuthorizationDecision | Promise<…> }); exported types AuthorizeHook, AuthorizeRequest, AuthorizeResult; activity entry authority.resource { allowed, reason? }. Additive: no change for apps without it.

**Tests:**

- packages/sdk/test/authorize.test.ts: 10 tests — decision from args + stored records; order (roles → validation → hook); AppPort dispatch; a real MCP client; denial evidence incl. NOT_FOUND concealment; commit fence (membership revoked mid-call → CONFLICT, nothing written); live read set; a real live-query client denied on revocation; fail closed (throw / garbage / write attempt); the compiled AppBoundry artifact
- Full FeltKit suite: 389/389 (baseline 379/379)

**Consumer acceptance:** acceptance/feltkit-authorize/run.sh: local FeltKit packed into a scratch copy of Multiplayer; Multiplayer's 18 tests pass unchanged (no regression), and pass again with the whole membership policy in one feltkit({ authorize }) hook while _authz.ts's requireWorkspace/requireChannel enforce nothing. (Pre-release scaffolding: the script patched a scratch copy before the package was published. Removed after adoption; it remains in history at commit 08a8136.)

**Measured effect:** Code size did not shrink: _authz.ts 51 → 45 lines, hook +45, net +39; 37 call sites remain as context loaders (participant, role, channel). The gain is guarantees: one policy on every function and interface, default-deny for functions the policy does not recognise, decision fenced at commit, live revocation, recorded decisions. The earlier estimate (≈63 lines disappear) was wrong and is corrected here.

**Remaining / unverified:**

- Not released (needs approval to publish @feltdb/feltkit).
- A central hook relies on argument naming (Multiplayer's presence:heartbeat names its channel `typingIn`; the first consumer run caught it). Proposal: optional per-function `resource: (args) => ({ type, id })` declaration so the policy does not infer from names.
- AppPort decisions cannot express NOT_FOUND (AppPort A9); FeltKit accepts fail('NOT_FOUND') from the hook.
- Unverified on the real AppBoundry runtime (@appport/appboundry): the guest change ships in the artifact, but the published runtime was not rebuilt with it here; FeltKit's reference host (createArtifactTestApp) passes.

## FK-GAP-002

### AuthBoundry has no resource-level evaluation, and FeltKit has no AuthBoundry adapter

Discovered 2026-11-05 · missing-capability · integration · severity medium · P2 · open — FeltKit integration point now exists (feltkit({ authorize })); AuthBoundry resource evaluation still missing

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

**Kind of code:** —

**If the platform provided it:** Would move membership records and policy to AuthBoundry; requires FK-GAP-001's hook as the integration point.

**Proposed change:** AuthBoundry: evaluate `resource` (not only record it). FeltKit: an adapter that implements AuthorizeHook by calling AuthBoundry enforce/decide with { principal, capability, resource } — plugs into the hook from FK-GAP-001 with no further FeltKit API.

**Architectural owner:** AuthBoundry (evaluation); FeltKit (adapter)

**Dependencies:** FK-GAP-001

## FK-GAP-003

### No tenancy / membership primitive

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · open — reassigned to AuthBoundry; FeltKit side now available (authorize hook)

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

**Custom LOC attributable:** ~147: memberships + invitations collections (~25), invitations.ts (75), workspaces setRole/removeMember (33), _ops addToWorkspace/joinChannel (14). Roughly 110 are reusable tenancy mechanics (membership, role-in-tenant, invitation lifecycle); ~35 are workspace semantics that stay.

**Engineering time attributable:** 3–4 h

**Kind of code:** mostly reusable mechanics; partly application-specific

**If the platform provided it:** Partly application-specific (what a workspace is), partly reusable (membership, role-in-tenant, invitation lifecycle). A primitive would remove the reusable part.

**Proposed change:** Optional `app.tenancy({ collection, roles })` primitive: membership + invitation records and a `ctx.tenant` resolved per call, feeding FK-GAP-001.

**Architectural owner:** AuthBoundry (membership as delegation), with FeltKit integration through FK-GAP-001/002 — not a FeltKit membership store

**Dependencies:** FK-GAP-001

**Ownership evidence:** authboundry docs/PHASE_PRODUCT_12_CUSTOMER_IDENTITY_TENANT_LIFECYCLE.md: 'Use AuthBoundry's delegation model for customer-to-organization membership, not a separate RBAC system.' A FeltKit tenancy store would duplicate it.

## FK-GAP-004

### No ephemeral / broadcast real-time primitive (presence, typing)

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · implemented across AppPort, FeltKit and AppBoundry (local branches); Multiplayer adoption blocked on the AppPort release

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

**Custom LOC attributable:** ~55: presence.ts (19), presence collection (~8), presence fields in workspaces:get (~6), client heartbeat/typing/expiry in Workspace.tsx (22). ~40 would disappear with an ephemeral channel; the UI rendering stays.

**Engineering time attributable:** 1.5 h

**Kind of code:** platform integration glue (workaround)

**If the platform provided it:** Mostly disappears: a platform `ctx.ephemeral.publish(topic, value, { ttl })` with authorized subscription would replace the collection, heartbeat mutation and expiry logic; the UI stays.

**Proposed change:** An authorized ephemeral channel on the existing /api/events stream: publish(topic, payload, ttl) from functions, subscribe(topic) from clients, topics authorized by FK-GAP-001's hook; never written to FeltDB.

**Architectural owner:** AppPort (events: authorization + scope) first; then FeltKit integration (ctx publish + client subscribe on AppPort events)

**Dependencies:** FK-GAP-001 (topic authorization)

#### Platform work (2026-11-05)

**What existed already:** AppPort events: defineEvent (with authorization), subscribe/unsubscribe/event envelopes, at-most-once EventBus ('nothing is buffered for absent subscribers'), WebSocket and SSE (/appport/events) delivery. This is the ephemeral channel; FeltKit should not build another.

**Defect found:** AppPort delivered events a session may not observe: a '*' subscription required nothing and received every event (spec §21.7 violated), and subscriptions were checked against session.permissions only (never the application's Authorizer), so principal-identified connections could not subscribe to permissioned events. Events had no scope, so per-tenant events would reach every tenant. Reproduced by packages/server/test/subscriptions.test.ts before the fix.

**Implemented:**

- FeltKit: app.event, ctx.events.publish (after commit, never stored), observation via authorize (kind 'observe'), client.subscribe/useEvent over /appport/events, events@1 in artifacts (af5b290)
- AppBoundry: host interface events@1 — events.stage, host.observe (guest decides), AppPort event registration and emission (f3fd439)
- AppPort: per-connection subscription ids (ada9157) — required for more than one subscriber

**Tests:**

- feltkit test/events.test.ts (4); suite 401/401 with AppPort fixes overlaid
- appboundry packages/appboundry-host/test/events.test.ts (3, incl. HTTP SSE + revocation); host suite 78/13 skipped
- cross-runtime: a FeltKit-built artifact with app.event on AppBoundry's host: member received, non-member nothing

**Remaining / unverified:**

- Release AppPort (core 1.6.1 + server with ada9157), then FeltKit/AppBoundry, then Multiplayer replaces its presence collection and heartbeat writes with presence events.

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

**Kind of code:** —

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

**Custom LOC attributable:** ~18 (messages:search). ~10 (scan + match) would disappear with an indexed text predicate; readable-channel filtering stays.

**Engineering time attributable:** 0.5 h

**Kind of code:** workaround

**If the platform provided it:** Filtering by readable channels stays (authorization); the scan and matching would disappear with an indexed text predicate.

**Proposed change:** A `contains`/`prefix` predicate and an optional text index declaration in app.collection(..., { search: ['text'] }).

**Architectural owner:** FeltDB (index), FeltKit (exposure)

**Dependencies:** none

## FK-GAP-007

### Files are application-shared; per-resource file access must be bound by the app

Discovered 2026-11-05 · missing-extension-point · integration · severity medium · P2 · implemented in FeltKit (branch claude/file-links, local, not pushed); Multiplayer adoption awaits release

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

**Custom LOC attributable:** ~78: _base64.ts (23), attachments.ts (38), attachments collection (~12), client base64/Blob conversions (~5). ~30 (base64 transfer) disappear with a signed file route; the channel binding (~45) is application semantics and stays.

**Engineering time attributable:** 1.5 h

**Kind of code:** glue (transfer) + application semantics (binding)

**If the platform provided it:** Binding record stays (it's app semantics); base64 plumbing disappears with a signed download URL; the authorization moves into FK-GAP-001's hook if Files consulted it.

**Proposed change:** Files: authorize reads through the app's resource authorizer (metadata-based), and a signed, short-lived download/upload URL issued by a function.

**Architectural owner:** AppPort Services (authorization by metadata, signed URLs); FeltKit (route)

**Dependencies:** FK-GAP-001

**Ownership evidence:** AppPort Services Files passes only { owner } as resource attributes to the authorizer (src/files/service.ts), not the file's metadata, so no policy can decide by the resource a file belongs to. Owner of that change: AppPort Services; the transfer route (signed download/upload) is FeltKit's.

#### Platform work (2026-11-05)

**Implemented:**

- FeltKit: ctx.services.files.link(id, {expiresInSeconds, disposition}) -> GET /api/files/<token> (5 min default, max 1 h, reusable until expiry)
- FeltKit: ctx.services.files.uploadLink({metadata, maxBytes, ...}) -> PUT /api/files/<token> (single use; created as the issuing principal with function-fixed metadata)
- FeltKit: client.uploadFile(link, blob), client.fileUrl(link); only SHA-256 of tokens stored (_feltkit_file_links); nosniff + sandbox CSP + Content-Disposition on download
- AppBoundry guest refuses link/uploadLink with UNAVAILABLE (no /api/files route on the host)

**Tests:**

- feltkit test/file-links.test.ts (4): upload->bind->download, membership decides link issuance, unknown/expired/used/wrong-kind/over-limit refused, removed file link 404

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

**Custom LOC attributable:** ~133: agentRequests collection (~17), agents.ts queue functions pending/claim/failRequest/requests (50), mention→request in messages:send (~8), agent/worker.ts (31), agent/room-agent.ts (27). ~110 would disappear with platform agent triggers; agent/compose.ts (69) is the agent's behaviour and stays.

**Engineering time attributable:** 3 h

**Kind of code:** platform integration glue (adapter + queue)

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

**Description:** The FeltKit → AppBoundry deploy contract is implemented and tested locally on both sides but explicitly not deployed: routing/TLS not implemented (address null), customer execution gated off (verified-runtime policy empty), no deploy token issued. Note: this is about the managed (Hetzner) target. Building and running an AppBoundry application locally is available both through FeltKit and, without FeltKit, through `npx appport add` (FK-GAP-015).

**Evidence:**

- appboundry docs/feltkit-deploy-readiness.md: 'Nothing here is deployed'; Routing 'designed, not implemented'; 'Untrusted execution in production: not ready'
- feltkit docs/APPBOUNDRY-DEPLOY-CONTRACT.md: 'not deployed'
- No APPBOUNDRY_URL / APPBOUNDRY_TOKEN in this environment
- npx feltkit deploy --target appboundry (2026-11-05): '✗ Deploying to AppBoundry needs APPBOUNDRY_URL (the AppBoundry portal), APPBOUNDRY_TOKEN (an AppBoundry deploy token).'
- https://appboundry.fly.dev/api/applications/multiplayer/hosting → HTTP 401 (portal up; contract's AUTHENTICATION_REQUIRED)

**What the developer wanted:** A working public URL on the approved Hetzner target.

**What the platform provides:** feltkit build --target appboundry (artifact) and @appport/appboundry run (local runtime).

**Implemented manually:** deploy/verify-appboundry.sh: builds the artifact and verifies it on the published runtime @appport/appboundry@1.8.0 (8/8 browser checks, restart recovery). No substitute hosting was provisioned.

**Workaround:** Build the artifact and verify it on the published AppBoundry runtime locally; no invented deployment.

**Custom LOC attributable:** 52 (deploy/verify-appboundry.sh 40 + deploy/check-persisted.ts 12) — verification, not a substitute deployment

**Engineering time attributable:** 1 h (investigation + verification script)

**Kind of code:** verification tooling

**If the platform provided it:** n/a

**Proposed change:** Ship AppBoundry routing (§18), pin a verified runtime, issue a scoped deploy token.

**Architectural owner:** AppBoundry

**Dependencies:** none

## FK-GAP-010

### No secure token / random primitive for application bearer secrets

Discovered 2026-11-05 · missing-capability · primitive · severity medium · P2 · closed — released in @feltdb/feltkit 0.3.16 and @appport/appboundry 1.9.0 (crypto@1); adopted by Multiplayer (workaround removed)

**Components:**

- rkendel1/feltkit (runtime/data.ts newId)
- AppBoundry guest (no ambient capabilities)

**Description:** Invitation links need an unguessable code. Record ids are `Date.now().toString(36) + randomBytes(6)` (48 random bits, timestamp prefix), and ctx offers no CSPRNG or token issuer that is guaranteed on both FeltKit's runtime and the AppBoundry WebAssembly guest (which removes ambient globals).

**Evidence:**

- node_modules/@feltdb/feltkit/dist/runtime/data.js: export function newId() { return `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`; }
- appboundry docs/feltkit-deploy-readiness.md §3: guest has no ambient capability; host ABI is a closed set (db.*, outbox.stage, AppPort Services)

**What the developer wanted:** Invitation codes with >=128 bits of entropy, revocable, single use, that work on every runtime.

**What the platform provides:** Record ids (48 random bits). Sessions/API keys exist but are for principals, not app-level links.

**Implemented manually:** Nothing.

**Workaround:** Removed (2026-11-05).

**Custom LOC attributable:** 0 after the primitive (consumer: one call)

**Engineering time attributable:** 0.5 h

**Kind of code:** —

**If the platform provided it:** Invitation code generation would become one platform call; the invitation lifecycle stays app code.

**Proposed change:** ctx.crypto.token(bytes=32) (host-provided CSPRNG in both runtimes), or a platform 'link token' primitive: issue/verify/revoke a signed, expiring, single-use token bound to a record.

**Architectural owner:** FeltKit (ctx.crypto) + AppBoundry (host interface crypto@1) — each in its own repository

**Dependencies:** none

#### Platform work (2026-11-05)

**What was missing:** A secure random source for bearer values that works in FeltKit's runtime and inside the AppBoundry WebAssembly guest (which has no entropy source and no ambient capabilities).

**What existed already:** FeltKit's optional host-interface pattern (transactions@1: declared by the build only when used, refused by hosts for artifacts that did not declare it, refused at load by runtimes that do not implement it); Node's CSPRNG on the host side.

**Reused:**

- the optional-interface pattern (build detection, manifest runtime.interfaces, host refusal)
- AppBoundry's SUPPORTED_INTERFACES compatibility check (ARTIFACT_INTERFACE_UNSUPPORTED)
- crypto.randomBytes

**Implemented:**

- FeltKit: ctx.crypto.token(bytes=32) on QueryCtx/MutationCtx (src/runtime/crypto-token.ts, runtime, guest host op `crypto.token`, reference host, build detection usesCrypto → crypto@1); type CryptoContext exported; docs README/GUARANTEES/CHANGELOG
- AppBoundry: SUPPORTED_INTERFACES.crypto=[1]; host op crypto.token (16–256 bytes, base64url; FORBIDDEN without the interface); docs/feltkit-deploy-readiness.md (closed operation set)

**Public API:** await ctx.crypto.token(bytes?: number): Promise<string>  (16–256 bytes, default 32, base64url). Artifact manifest: runtime.interfaces.crypto = 1 when used. AppBoundry host operation crypto.token.

**Tests:**

- FeltKit test/crypto-token.test.ts (3): 200 tokens unique, 32 bytes, every bit varies across the sample; bounds; artifact on the reference host; manifest declares crypto@1 only when used; host refuses without it
- AppBoundry packages/appboundry-host/test/crypto.test.ts (3); appboundry-host suite 75 passed, 13 skipped (incl. isolation verification)
- Cross-runtime: FeltKit-built artifacts run on AppBoundry's runtime host (local build): crypto@1 tokens drawn by AppBoundry; the authorize hook (FK-GAP-001) enforced inside the artifact. The published @appport/appboundry 1.8.0 refuses the crypto artifact at load (ARTIFACT_INTERFACE_UNSUPPORTED) and loads the authorize artifact.
- FeltKit full suite: 392/392 (391 + the docs-citation test re-run after a docs fix)

**Consumer acceptance:** acceptance/feltkit-crypto-token/run.sh: Multiplayer's invitation codes become ctx.crypto.token() values (stored, unique, looked up by code) in a scratch copy on the local FeltKit — runtime: 18/18; compiled artifact: 18/18 (manifest declares crypto@1). (Pre-release scaffolding: the script patched a scratch copy before the package was published. Removed after adoption; it remains in history at commit 08a8136.)

**Measured effect:** Invitation codes go from 48 random bits + a timestamp (record id) to 256 random bits. Code change in the consumer: one call to create the code and lookups by `code` instead of by id (+1 collection field, unique).

**Remaining / unverified:**

- Not released (FeltKit and AppBoundry publishing need approval). Until AppBoundry ships crypto@1, an artifact using ctx.crypto.token cannot run on the published runtime (refused at load, clearly).
- No rate limiting of invitation attempts (application/edge concern).

## FK-GAP-011

### Client reconnect waits out exponential backoff (up to 10 s) after the network returns

Discovered 2026-11-05 · developer-experience · client · severity low · P3 · implemented (FeltKit 40ba4ad, local); awaiting review/release; Multiplayer e2e catch-up to be re-measured on release

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

**Engineering time attributable:** 0.25 h

**Kind of code:** —

**If the platform provided it:** n/a

**Proposed change:** Reset the backoff and reconnect on window 'online' and on visibilitychange→visible.

**Architectural owner:** FeltKit client

**Dependencies:** none

#### Platform work (2026-11-05)

**Implemented:**

- client waitOrWake: backoff ends early on window 'online' or document visible; backoff resets after a wake

**Tests:**

- test/client-reconnect.test.ts (5)

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

**Custom LOC attributable:** ~15 (return schemas for 5 capabilities)

**Engineering time attributable:** 0.25 h

**Kind of code:** contract (by design)

**If the platform provided it:** Would shrink if returns could be derived from collection docs plus picks automatically; the contract itself should stay explicit.

**Proposed change:** None required; optionally a codegen hint that drafts the schema from the handler's inferred type.

**Architectural owner:** FeltKit

**Dependencies:** none

## FK-GAP-013

### FeltKit built-in accounts (sign-up / sign-in) are not available when the artifact runs on AppBoundry

Discovered 2026-11-05 · missing-integration · integration · severity high · P1 · open (blocks self-serve onboarding on the approved target)

**Components:**

- rkendel1/feltkit (auth.accounts)
- @appport/appboundry 1.8.0 (identity@1)

**Description:** The app declares auth: { accounts: { roles: ['member'] } }. Under feltkit dev/start, people sign up with e-mail and password. The same artifact on AppBoundry (production environment) reports 'sessions issued by operators only': /api/session has no `accounts`, and every user must be created with `appboundry admin users add` and given an operator-issued session. A self-serve collaboration product cannot onboard people on the approved target.

**Evidence:**

- appboundry run output: 'Environment production (sessions issued by operators only)'
- GET /api/session on the artifact: {devUsers: [], dashboard: null} — no accounts key; on feltkit dev the same call returns accounts: {signUp: true}
- deploy/verify-appboundry.sh provisions ada/grace/assistant with appboundry admin users add + sessions issue

**What the developer wanted:** People sign up and accept an invitation link on the deployed app.

**What the platform provides:** Operator-provisioned users and sessions (AppBoundry admin CLI).

**Implemented manually:** Nothing in the app; deployment script provisions identities by hand.

**Workaround:** Operator issues sessions; the app's SessionForm (from the starter) accepts a pasted session.

**Custom LOC attributable:** 0 app code; ~10 lines in deploy/verify-appboundry.sh provision users and sessions

**Engineering time attributable:** 0.5 h

**Kind of code:** deployment glue

**If the platform provided it:** n/a

**Proposed change:** AppBoundry: implement the accounts interface FeltKit's manifest declares (or delegate to AuthBoundry), so auth.accounts behaves the same on both runtimes; feltkit build should warn when the target cannot honour auth.accounts.

**Architectural owner:** AppBoundry (identity host interface); AuthBoundry as the eventual identity owner

**Dependencies:** FK-GAP-002

## FK-GAP-014

### MCP endpoint (and Studio) are not part of the artifact; agents on AppBoundry use HTTP only

Discovered 2026-11-05 · missing-integration · integration · severity medium · P2 · open

**Components:**

- rkendel1/feltkit (feltkit build --target appboundry)
- AppBoundry

**Description:** feltkit build --target appboundry notes 'FeltKit Studio and the MCP endpoint are served by FeltKit, not by an artifact.' External agents that speak MCP cannot connect to the deployed app. The room agent works because it uses FeltKit's function API with an agent session, which AppBoundry serves.

**Evidence:**

- feltkit build --target appboundry: '• Not in the artifact: FeltKit Studio (the development dashboard) and the MCP endpoint'
- deploy/verify-appboundry.sh: room agent answers over HTTP on the artifact

**What the developer wanted:** Agents discover and invoke the app's capabilities over MCP wherever the app runs.

**What the platform provides:** MCP on feltkit dev/start only.

**Implemented manually:** Room agent uses the HTTP client instead of MCP.

**Workaround:** HTTP function API with an agent session.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0

**Kind of code:** —

**If the platform provided it:** n/a

**Proposed change:** AppBoundry serves /appport and /mcp from the manifest's AppPort contract (the capability set is already in manifest.json).

**Architectural owner:** AppBoundry (web interface); AppPort (MCP transport)

**Dependencies:** none

## FK-GAP-015

### Two AppBoundry artifact formats and runtime paths: repository bundles (appport add) and FeltKit artifacts are not interchangeable

Discovered 2026-11-05 · missing-integration · architecture · severity medium · P2 · open

**Components:**

- rkendel1/appboundry (@appport/appboundry 1.8.0)
- appport CLI 1.3.0
- rkendel1/feltkit (feltkit build --target appboundry)

**Description:** Any repository can become an AppBoundry application without FeltKit: `npx appport add` generates a contract, boundary and WASM crate; `npx appport app package` writes `<name>.app` (protocol AppPort/application-bundle/1: application.wasm + manifest), which `appboundry app install` and `appport app start` run (examples/todos: WASM execution units, external durable FeltDB state). FeltKit instead emits format appboundry.app/1 (manifest.json + module.wasm + assets), which `appboundry run` / `artifact verify` serve and which the FeltKit→AppBoundry deploy contract ships. `appboundry artifact verify` refuses the repository bundle (ARTIFACT_MANIFEST_MISSING). Two packaging contracts, two runtime entry points and two capability manifests for one control plane.

**Evidence:**

- /tmp test 2026-11-05: npx appport add → 'Standalone AppPort setup complete', WASM sha256:ddde2a4e…; npx appport app package → multiplayer-direct.app (application.wasm, manifest: protocol AppPort/application-bundle/1)
- appboundry artifact verify multiplayer-direct.app → 'error ARTIFACT_MANIFEST_MISSING: … has no manifest.json' (same for examples/todos/todos.app)
- appboundry app install multiplayer-direct.app → 'Installed com.example.multiplayerdirect'
- appport app start ./todos.app → 'Execution unit: exec_… Durable state: state_… (external)'
- appboundry docs/contracts/feltkit-deploy/CONTRACT.md: the managed deploy contract is defined for the FeltKit artifact

**What the developer wanted:** One artifact contract that any producer (FeltKit, appport add in any language) emits and every AppBoundry runtime path (local run, install, Hetzner agent) accepts.

**What the platform provides:** Both paths work separately.

**Implemented manually:** Nothing (finding from the direct-stack comparison).

**Workaround:** Use the FeltKit artifact path for this app.

**Custom LOC attributable:** 0

**Engineering time attributable:** 1 (investigation)

**Kind of code:** —

**If the platform provided it:** n/a

**Proposed change:** Converge on one AppBoundry artifact contract (or make each runtime path accept both with one verifier), and make the managed deploy contract producer-neutral so `appport add` applications deploy the same way FeltKit ones do.

**Architectural owner:** AppBoundry (artifact contract); AppPort (packager); FeltKit (producer)

**Dependencies:** FK-GAP-009

## FK-GAP-016

### `npx appport add` is interactive-only and needs a Rust wasm32 toolchain

Discovered 2026-11-05 · developer-experience · dx · severity low · P3 · closed in code (AppBoundry 5b1e311, local): the gap was smaller than recorded

**Components:**

- appport CLI 1.3.0

**Description:** `appport add` asks for the application and each capability on a TTY. Piped stdin ends the run ('Detected unsettled top-level await', exit 13) because each prompt opens a new reader; no flags or file input were discoverable (`appport add --help` prints the top-level help). The WASM build then needs `rustup target add wasm32-unknown-unknown`; the CLI says so clearly and resumes without repeating setup. CORRECTED 2026-11-05: flags existed; see resolution.finding.

**Evidence:**

- printf answers | npx appport add → exits after 'Application ID' prompt with 'Warning: Detected unsettled top-level await'
- driving prompts one at a time (tools: /tmp drive-add.cjs) completes; 'error The generated boundary is ready, but the WASM toolchain could not build it. Install Rust and the target…'

**What the developer wanted:** Scripted, reproducible onboarding (CI, agents).

**What the platform provides:** Interactive prompts; clear resume message.

**Implemented manually:** A small prompt driver for the comparison experiment (not part of the app).

**Workaround:** Answer prompts one by one.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.5

**Kind of code:** —

**If the platform provided it:** n/a

**Proposed change:** `appport add --non-interactive --name … --capability name:in:out:perm` or `--from contract.json`; document the Rust requirement up front.

**Architectural owner:** AppPort CLI

**Dependencies:** none

#### Platform work (2026-11-05)

**Implemented:**

- COMMAND_HELP.add (flags, example, Rust wasm32 requirement)
- no-TTY refusal naming the missing flag

**Tests:**

- packages/cli/test/add-non-interactive.test.ts (4)

## FK-GAP-017

### AppPort delivered events a session may not observe (wildcard subscriptions; subscriptions bypassed the application Authorizer)

Discovered 2026-11-05 · missing-capability · security · severity high · P1 · closed — released in AppPort (@appport/protocol 1.4.0, core 1.6.0, server 1.2.0, sdk 1.5.0, authorization 1.0.8)

**Components:**

- rkendel1/appport (packages/server/src/connection.ts)

**Description:** A '*' subscription required no permission and received every event, including those whose definition requires permissions, contrary to spec §21.7. Subscription checks read session.permissions only, never the application's Authorizer. Found while closing FK-GAP-004.

**Evidence:**

- packages/server/test/subscriptions.test.ts 'does not deliver events a wildcard subscriber may not observe' failed on e9815a5: received ['secrets.changed', 'news.posted'] for a principal without secrets.read
- connection.ts (e9815a5) #subscribe: `const definition = name === "*" ? undefined : …; const required = definition?.authorization ?? []; const granted = this.#session?.permissions ?? []`

**What the developer wanted:** Events reach only sessions allowed to observe them.

**What the platform provides:** Exact-name permission check against session.permissions.

**Implemented manually:** Nothing in apps (FeltKit does not use AppPort events yet, so no FeltKit app was exposed).

**Workaround:** —

**Custom LOC attributable:** 0

**Engineering time attributable:** 1.5 (fix + tests)

**Kind of code:** platform defect

**If the platform provided it:** Fixed upstream (local).

**Proposed change:** Implemented: authorize subscribe and each delivery through the application's Authorizer.

**Architectural owner:** AppPort

**Dependencies:** none

#### Platform work (undefined)

## FK-GAP-018

### AppPort decisions cannot conceal existence (no NOT_FOUND denial)

Discovered 2026-11-05 · missing-extension-point · contract · severity low · P3 · implemented (AppPort 81ba58f + FeltKit 3abc1bd, local); awaiting review/release

**Components:**

- @appport/authorization AuthorizationDecision

**Description:** A policy that answers unknown and unauthorized ids alike (NOT_FOUND) cannot express it in AppPort's decision, which denies only with UNAUTHORIZED or FORBIDDEN.

**Evidence:**

- @appport/authorization dist/index.d.ts: { allowed: false; code: 'UNAUTHORIZED' | 'FORBIDDEN'; reason? }
- Multiplayer refuses cross-tenant ids with NOT_FOUND (tests/security.test.ts)

**What the developer wanted:** Refuse without revealing that the record exists.

**What the platform provides:** FORBIDDEN/UNAUTHORIZED.

**Implemented manually:** FeltKit accepts fail('NOT_FOUND') thrown from the authorize hook and records it as a denial.

**Workaround:** Throw instead of returning a decision.

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.25

**Kind of code:** —

**If the platform provided it:** n/a

**Proposed change:** Optional `NOT_FOUND` denial code (or `conceal: true`) on AuthorizationDecision.

**Architectural owner:** AppPort

**Dependencies:** none

#### Platform work (2026-11-05)

**Implemented:**

- AppPort: DenialCode adds NOT_FOUND; deny(); decisionToError; subscriptions report it; spec 12.3/9.4
- FeltKit: authorize honours a returned NOT_FOUND decision

**Tests:**

- appport packages/server/test/conceal.test.ts (3); suite 1818+
- feltkit test/authorize.test.ts

## FK-GAP-019

### @appport/core 1.6.0 is not portable: a test-only barrier imports node:fs/node:path at load

Discovered 2026-11-05 · missing-capability · defect · severity high · P1 · fixed in AppPort (66a7874, local) with a portability test over core's import graph; needs core 1.6.1

**Components:**

- rkendel1/appport packages/core/src/execution-barrier.ts

**Description:** sdk 1.5.0 re-exports runtime-host hooks, so every bundle reaching @appport/sdk reaches server-internal → execution-barrier, which imported node:fs/node:path statically. FeltKit's AppBoundry build (correctly) refuses Node APIs, so upgrading FeltKit to AppPort 1.5 broke all 18 artifact tests.

**Evidence:**

- feltkit suite on sdk 1.5.0: 18 failures, 'node_modules/@appport/core/dist/execution-barrier.js:11: node:fs is a Node API'
- with the fix overlaid: 397/397

**What the developer wanted:** —

**What the platform provides:** —

**Implemented manually:** —

**Workaround:** —

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.5–1

**Kind of code:** platform defect

**If the platform provided it:** n/a

**Proposed change:** Release the fix.

**Architectural owner:** AppPort

**Dependencies:** none

## FK-GAP-020

### AppPort: subscriptions from different connections with the same subscriptionId replaced each other

Discovered 2026-11-05 · missing-capability · defect · severity high · P1 · fixed in AppPort (ada9157, local); needs a server release

**Components:**

- rkendel1/appport packages/server/src/connection.ts

**Description:** Subscriptions were registered on the shared bus under the client's subscriptionId. Every SSE request uses sub_sse_1, so the second subscriber replaced the first (which then received nothing) and one unsubscribe released another's subscription. Found by FeltKit's events test (only the last of several subscribers received).

**Evidence:**

- packages/server/test/subscriptions.test.ts 'per connection' failed before: first connection received []
- FeltKit events test: the first subscriber after boot never received

**What the developer wanted:** —

**What the platform provides:** —

**Implemented manually:** —

**Workaround:** —

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.5–1

**Kind of code:** platform defect

**If the platform provided it:** n/a

**Proposed change:** Release the fix.

**Architectural owner:** AppPort

**Dependencies:** none

## FK-GAP-021

### @appport/resolver-client pins @appport/sdk 1.4.0 (and the resolver server pins @appport/server 1.1.5)

Discovered 2026-11-05 · missing-integration · dependency · severity medium · P2 · fixed in rkendel1/resolver (c61fe14, local; tests 173 passed/9 skipped, unchanged); needs a release

**Components:**

- rkendel1/resolver

**Description:** FeltKit depends on resolver-client; its exact sdk 1.4.0 pin installs a second AppPort copy in every FeltKit app once FeltKit moves to 1.5, and the resolver server ran the pre-fix subscription path.

**Evidence:**

- npm ls in feltkit: @appport/resolver-client@0.2.0 → @appport/sdk@1.4.0 → core 1.4.0 / server 1.1.5

**What the developer wanted:** —

**What the platform provides:** —

**Implemented manually:** —

**Workaround:** —

**Custom LOC attributable:** 0

**Engineering time attributable:** 0.5–1

**Kind of code:** platform defect

**If the platform provided it:** n/a

**Proposed change:** Release the fix.

**Architectural owner:** Resolver

**Dependencies:** none
