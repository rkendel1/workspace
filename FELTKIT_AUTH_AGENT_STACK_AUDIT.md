# FeltKit auth, identity and agent primitives: stack audit

Phase 1 of *FeltKit: Authentication, Identity, Agent Primitives and Developer Experience*.
Date: 2026-11-05. **No code was changed for this audit.** It is the evidence on which phase 2 and later work is proposed.
The proposals are in §5 and §6. They need a decision before implementation starts (§7).

## How this was produced, and how far to trust it

- **Repositories read.** All were read at their current HEAD, read-only:
  - feltkit at `main` f49d9ac, and `claude/scoped-events` af5b290 for events;
  - authboundry b8ed659;
  - appport, appport-services 0.15.0, appboundry, resolver;
  - stack-agent c066006, chip-rs c14522a, appworks 4cc8ea3, mailport 21b3913;
  - felt-ops;
  - Multiplayer (`multiplayer/`).
- **Who did the reading.** Three read-only inventories were written in parallel. They are kept unabridged as appendices, with file:line and test names for every row:
  - [A: FeltKit and Multiplayer](audit/A-feltkit-and-multiplayer.md)
  - [B: AuthBoundry, MailPort, AppPort Services, felt-ops](audit/B-authboundry-mailport-services.md)
  - [C: Agent runtimes, AppPort, AppBoundry, Resolver](audit/C-agent-runtimes-appport-appboundry-resolver.md)
- **Status scale.**
  - **1** implemented and tested: a test exercising it was found and named.
  - **2** implemented but incomplete.
  - **3** contract or schema only.
  - **4** planned or documented only.
  - **5** missing.
- **Tests run.**
  - FeltKit: auth and agent tests, 88 passed, 0 failed.
  - AuthBoundry: `dsl`, `authz`, `runtime` and `providers` crate tests, all passing.
  - MailPort: 4 test files, all passing.
  - Every other "tested" mark means the test was found, not run.
- **Re-verified by hand for this summary.** Each of these was checked against source:
  - AuthBoundry `delegate()` refuses to widen authority (`crates/runtime/src/mesh.rs:720`), with tests `delegation_cannot_exceed_the_delegators_own_authority` and `chained_delegation_preserves_attenuated_scope_and_evidence` (`crates/runtime/tests/end_to_end_auth.rs:354,748`).
  - AppPort `Principal.type` is `user | service | device | application`, with no agent type (`packages/protocol/src/session.ts:11`).
  - AppPort `delegationId` is declared at `packages/protocol/src/authorization.ts:37` and used nowhere.
  - FeltKit OAuth uses PKCE S256 and a signed `state` (`server/oauth.ts:120-129`), and reads identity from the userinfo endpoint (`:179`).
  - FeltKit session tokens are in `localStorage` (`client/index.ts:117-126`).
  - Sign-in throttling is keyed by e-mail and by an `X-Forwarded-For`-derived caller (`accounts.ts:174`, `server/index.ts:254`).
  - FeltKit has a fixed playbook list (`runtime/agent.ts:214`).
- **Facts versus inference.** Statements are facts with evidence unless marked *(inference)*.

## 1. The answer in one page

1. **FeltKit already owns a working, tested auth core.** It covers:
   - accounts with scrypt;
   - e-mail verification and reset through MailPort;
   - OIDC, Google and GitHub with PKCE;
   - digest-stored sessions with revocation;
   - roles, `access` and the `authorize` hook;
   - dev users, API keys and CLI agent sessions.

   It does **not** have tenancy, typed claims, magic link or e-mail codes, account lifecycle, MFA, delegation, or UI components. Phase 2 is *extension* of the auth core, not a new system.
2. **AuthBoundry holds the proven principal/delegation design, but only as Rust or behind its server.**
   - Its design is human/agent/service principals, an agent lifecycle, delegation with attenuation and chains, and typed claims. The design is tested.
   - Its JS SDK (`enforce`) makes an HTTP call to a running AuthBoundry for every decision.
   - The Rust crates are pure libraries but unpublished, have no WASM or N-API build, and the npm package is `UNLICENSED`.
   - **Under the constraint "no external AuthBoundry hosted service dependency", FeltKit cannot call AuthBoundry at runtime.** It can adopt AuthBoundry's *contract* (record shapes, rules, test vectors). §5.3 argues this is one model with two implementations, not a duplicate model, provided both run the same conformance vectors.
3. **AuthBoundry also lacks tenancy and magic link.** Memberships and invitations are missing (5). Tenant switching is a DSL flag only (4). E-mail one-time codes are incomplete (2: no expiry, no attempt limit, never mailed). Magic link is declared-only (3). Nothing upstream exists to reuse for these; FeltKit must build them.
4. **There is one `use auth` DSL in the stack, AuthBoundry's, and FeltKit has no DSL at all.** FeltKit configuration is TypeScript (`feltkit({ … })`). §5.1 recommends expressing the requested `use auth { … }` surface as `feltkit({ auth: { … } })` with the same keys. A parsed `.flow` file inside FeltKit would be a second configuration language for FeltKit apps.
5. **Mail: reuse is real and already wired.** FeltKit → AppPort Services notifications (`EmailNotificationChannel`) → MailPort (`/v1/messages`). MailPort has templates, identities, idempotency, an outbox and suppression, but no challenge primitive. Challenges (codes, magic links) belong in FeltKit's auth layer, sent through this existing path.
6. **There is no second agent runtime to adopt, and none should be built.**
   - FeltKit's `ctx.agent` (`AgentHost`) is the only in-app runtime with approvals, authority-as-owner, FeltDB agent state, AppPort dispatch, Resolver model refs, crash recovery and MCP handoff, all tested.
   - stack-agent is the strongest *external* executor (Rust, evidence-verified loop, evaluation harness), but it has no agent identity, no delegation and no package.
   - chip-rs is superseded by stack-agent.
   - AppWorks duplicates the decision contract (`appworks.agent/1`) and is private.
7. **The genuinely missing agent pieces are missing everywhere.** No repo has:
   - an agent *definition* with job, responsibilities, success criteria, escalation target, authority and model preference;
   - agent deployments, instances or assignments distinct from runs;
   - event or schedule triggers for agents (FK-GAP-008);
   - an on-behalf-of chain outside AuthBoundry;
   - an evaluation harness in TypeScript.

   The nearest base is FeltDB's `AgentDefinition` (name, version, capabilities, goals, constraints, approval policies), which FeltKit already uses.
8. **Multiplayer shows the cost of the gaps.** It hand-builds the following, and does not use `ctx.agent` at all:
   - workspaces and memberships with ranks;
   - invitations;
   - profiles;
   - its own activity log;
   - an agent queue with an external worker.

## 2. Capability matrix: authentication, identity, authority

"FeltKit integration": **native** means FeltKit's own code; **via** means FeltKit calls it; **none** means not connected.

| Capability | Existing implementation | Repository / package | Status | FeltKit integration | Remaining work |
|---|---|---|---|---|---|
| Password accounts (sign-up, sign-in, scrypt) | `AccountStore` (`runtime/accounts.ts:136-183`), `/api/auth/signup`, `/api/auth/signin` | feltkit `@feltdb/feltkit` | 1 | native | Account lifecycle (below) |
| | Local password provider | authboundry `providers` crate | 1 | none (server only) | — |
| E-mail verification | HMAC-signed stateless links, 7-day TTL (`account-links.ts`) | feltkit | 1 | native | — |
| Password reset (single-use, revokes sessions) | `account-links.ts` bound to the password hash; `revokePrincipal` | feltkit | 1 | native | — |
| Magic link sign-in | none | feltkit | **5** | — | Build: opaque, single-use, ≤15 min, digest-stored, attempt-limited (§5.4) |
| | Declared, refuses every attempt | authboundry | 3 | none | — |
| E-mail one-time code | none | feltkit | **5** | — | Build with magic link (one challenge store, two deliveries) |
| | 32-byte code, tenant+e-mail bound, single use; **no TTL, no attempt limit, not mailed** | authboundry `providers/src/connectors/email.rs` | 2 | none | Port the design, add TTL and limits |
| OIDC (generic) | Discovery, issuer check, PKCE S256, signed `state` cookie, `email_verified` required; identity from userinfo | feltkit `server/oauth.ts:41-190` | 1 | native | Optional: ID-token/nonce verification (the back-channel code exchange makes it non-critical *(inference)*) |
| | Declared only | authboundry | 3 | none | — |
| Google / GitHub | Hard-coded endpoints; GitHub takes the primary verified e-mail | feltkit `oauth.ts:39-40,178` | 2 | native | Flow-level tests with a fake IdP (only definition-time validation is tested) |
| | GitHub 1; Google 2 (no PKCE, nonce, id_token) | authboundry | 1 / 2 | none | — |
| Provider adapter architecture | Fixed `google`, `github`, `oidc` ids; an unconfigured provider fails at definition time (`app.ts:438,446`) | feltkit | 2 | native | A provider interface so new IdPs are adapters, not edits |
| | Connector catalog | authboundry | 1 | none | Use as the adapter-shape reference |
| Sessions: issue, digest storage, expiry, revoke | `fks_` + 256-bit token, SHA-256 stored, 7-day default (`runtime/sessions.ts`) | feltkit | 1 | native | Tenant on the session (tenancy) |
| | `apt_` opaque, 1 h TTL; cookie lacks `Secure` | authboundry server | 1 | none | — |
| | Operator-issued, hashed, revocable | appboundry | 1 | via artifact | Accounts on AppBoundry (FK-GAP-013) |
| User session list / sign out everywhere | `revokePrincipal` exists; no user-facing API | feltkit | 2 | native | `client.sessions()`, `client.signOutEverywhere()` |
| Client token storage | `localStorage` (`client/index.ts:117-126`) | feltkit | 2 | native | Option of an HttpOnly cookie session (needs CSRF design), or keep bearer and document it |
| Sign-in throttling | 10 per 15 min per e-mail and per caller; in memory, per process; caller from an unverified `X-Forwarded-For` | feltkit `accounts.ts:91-183`, `server/index.ts:254` | 2 | native | Trusted-proxy setting; durable counters |
| Account lifecycle (profile, e-mail change, delete, disable, role change) | none | feltkit | **5** | — | Build (§5.2) |
| MFA / passkeys | none | feltkit, authboundry | **5** | — | Out of the phase 2 scope; noted |
| Roles → permissions | AppPort `permissionAuthorizer`, wildcards, `policyVersion` | feltkit + `@appport/authorization` | 1 | native | Roles are copied into the session at sign-in. Re-resolve on change (lifecycle) |
| Typed claims | `Principal = { id, type, displayName?, roles }`, no claims | feltkit | **5** | — | Build (§5.2) |
| | `enum`, `string`, `integer` and `boolean` claims, checked against the declaration; roles are an enum claim | authboundry `contract`, `authz` | 1 | none | Adopt the semantics |
| Server-side enforcement | `access`, then argument validation, then `authorize` hook; fails closed; same path for HTTP, AppPort, MCP, agent and jobs | feltkit (`authority.ts`, `authorize.ts`) | 1 | native | Claims and tenant must reach `AuthorizeRequest` |
| | `enforce()`: HTTP to a server; resource checks are recorded as evidence only (`control_routes.rs:1665`) | authboundry `@authboundry/core/server` | 2 | none | Not usable (runtime dependency) |
| Tenancy: tenants, memberships, invitations, switching, tenant-scoped sessions | none. Single-tenant per app (`GUARANTEES.md:288`). Multiplayer hand-builds it | feltkit | **5** | — | Build (§5.2) |
| | Tenant isolation is 1, but one tenant per principal; memberships and invitations 5; switching 4 | authboundry | 1 / 5 / 4 | none | — |
| | Services are tenant-keyed; FeltKit passes the app name | appport-services | 1 (keying) | via | Pass the active tenant when tenancy exists *(inference: confirm the Services authorizer semantics)* |
| Principal kinds | `user`, `agent`, `service`; only `user` approves (`agent.ts:550`) | feltkit | 1 (basic) | native | Agent principals as a first-class kind with lifecycle (§6.2) |
| | `Human`, `Agent`, `Service`; agent lifecycle Created/Active/Suspended/Revoked/Retired | authboundry `contract/src/principal.rs` | 1 | none | Adopt the semantics |
| | `user`, `service`, `device`, `application`; FeltKit maps agent → application | appport protocol | 1 | via | AppPort change: add `agent` (§6.2) |
| | `agent` type; accepts AuthBoundry `aga_` credentials (tested) | appboundry | 1 | via | — |
| Delegation (on-behalf-of, scope, expiry, revocation, chain, attenuation) | Planned, "AuthBoundry adapter" (`docs/AGENT-OPERATIONS.md:59-71`); `delegatedBy` is always null | feltkit | **4** | — | Build to AuthBoundry's contract (§5.3) |
| | Record `{delegator, delegate, tenant, capabilities, resource_scope, issued/expires/revoked, chain}`; attenuation checked at creation; task-scoped runs; **not re-checked at decision time** | authboundry `contract/src/delegation.rs`, `runtime/src/mesh.rs:720-1100` | 1 | none | — |
| | `delegationId?` declared, unused | appport protocol | 3 | none | Make it carry an actor/subject pair (§6.2) |
| Agent credentials | CLI `feltkit session create --type agent` (role, TTL) | feltkit | 1 | native | Bind to an agent principal and a delegation |
| | `aga_`: rotation, replay detection, family revocation | authboundry server | 1 | none (server only) | Semantics reference |
| API keys | AppPort Services api-keys → `service` principal with configured roles | feltkit + appport-services | 1 | via | — |
| `use auth` DSL | Parser, 17 tests; compiles to `AuthConfig` | authboundry `crates/dsl` (Rust, unpublished) | 1 | none | §5.1 decision |
| | none (TypeScript configuration only) | feltkit | 5 (by design) | — | — |
| Auth audit | `_feltkit_activity` kind `auth`: session issued/revoked, denials; failed sign-ins **not** recorded; 2000-entry cap | feltkit `runtime/activity.ts` | 2 | native | Durable, uncapped auth audit including failures |
| | Append-only audit | authboundry | 1 | none | — |
| Auth UI | Client methods: sign up/in/out, reset, verify, `signInWith`. Screens only in the starter template | feltkit | 1 (hooks) / **5** (components) | native | `@feltdb/feltkit/react` auth components (§5.5) |
| Mail delivery for auth | FeltKit → AppPort Services notifications → MailPort `/v1/messages`; in-memory inbox in dev | feltkit + appport-services + mailport | 1 | via | Challenge templates. MailPort contract test against real MailPort (currently a fake server) |
| | Templates, identities, idempotency, outbox, suppression; **no challenge primitive** | mailport `mailerport@0.1.0` | 1 | via | — |

## 3. Capability matrix: agent primitives

| Capability | Existing implementation | Repository / package | Status | FeltKit integration | Remaining work |
|---|---|---|---|---|---|
| Decision put to a model (one choice among authorized options plus escalate) | `ctx.agent.start({ objective, decision })`, `DecisionSpec` | feltkit `runtime/agent.ts`, `decisions.ts` | 1 | native | — |
| | `WorkDecision` | stack-agent, chip-rs | 1 | none | Do not duplicate |
| | `appworks.agent/1` | appworks (private) | 1 | none | Duplicate of the same shape |
| Action lifecycle (proposal → approval → execution), crash recovery | AgentHost | feltkit | 1 | native | — |
| Approvals | People only; `approval: "required"` | feltkit | 1 | native | Named approvers and roles per agent definition |
| | Workflow and recipe approvals with assignees | appworks recipe runtime (private) | 1 | none | Reference for multi-step approvals |
| | cli2 backend only | stack-agent | 2 | none | — |
| Escalation | `ESCALATE` option to a person | feltkit | 1 | native | Named escalation target per definition |
| Agent definition (job, responsibilities, personality, capabilities, authority, success criteria, escalation, approvals, model preference, version) | `AgentDefinition`: name, version, capabilities, goals, constraints, approval policies, memory | `@feltdb/core` (used by FeltKit) | 2 | via | Extend (§6.1). Responsibilities, success criteria, escalation, authority and model are missing **everywhere** |
| | One built-in agent (`feltkit` v1); 6 fixed playbooks | feltkit | 2 | native | App-defined agents |
| Deployment, instance, assignment | none | all repositories | **5** | — | Build (§6.1) |
| Task | Agent task, FeltDB agent state | feltkit + FeltDB | 1 | native | Link to an assignment and a delegation |
| Interaction (end-user conversation with an agent) | none in FeltKit; MCP handoff tools exist | feltkit | **5** / 1 (handoff) | — | Build on tasks (§6.1) |
| Tool exposure and authority | MCP server: app capabilities plus 8 `feltkit_agent_*` tools, authorized as the caller | feltkit `server/mcp.ts` | 1 | native | Per-agent capability allow-list (attenuation) |
| | Discovery, invocation, `Authorizer`, sessions, MCP, events | appport | 1 | via | `agent` principal, `delegationId` |
| Model providers (replaceable) | openai, openai-compatible, anthropic, custom `DecisionRuntime`, or Resolver `ref://` | feltkit + FeltDB + resolver | 1 | native / via | Per-agent model preference as a Resolver ref |
| | Rust OpenAI and Anthropic | stack-agent | 1 | none | Do not write a fourth adapter set |
| Triggers (event, schedule) | Jobs and schedules exist; no agent trigger | feltkit + appport-services | 2 | native | FK-GAP-008 (§6.3) |
| Evaluation | none | feltkit | **5** | — | §6.4 |
| | Experiments, benches, corpora (Rust) | stack-agent | 1 | none | Reuse the method; fixtures in FeltKit |
| Memory (long-term) | `AgentDefinition.memory` field; nothing general | FeltDB | 3 | via | Out of scope for phase 3 |
| | Bounded episodic recall | stack-agent | 2 | none | — |
| Audit of agent actions | Activity log and receipts; `delegatedBy` is null | feltkit | 1 (actor) / 4 (delegator) | native | Record the delegation and on-behalf-of in receipts |
| External executor (open-ended coding or ops work) | Claims a FeltKit handoff, proposes; FeltKit approves and executes (documented role) | stack-agent | 2 (no FeltKit wiring, operator token only) | none | Give it an agent credential; wire the handoff |
| Resolution of models, secrets and endpoints | `ref://` with pinned digests | resolver | 1 | via | — |

## 4. Ownership and dependency map

```
                 ┌──────────────── FeltKit (owns app state, auth, agents) ────────────────┐
 browser/app ──▶ │ accounts · sessions · tenancy* · claims* · challenges* · delegation*   │
                 │ Authority (roles → authorize hook) · AgentHost (ctx.agent, approvals)  │
                 └───────┬──────────────┬───────────────┬──────────────┬──────────────────┘
                         │ dispatch     │ services      │ state         │ model refs
                         ▼              ▼               ▼               ▼
                     AppPort     AppPort Services     FeltDB         Resolver
                 (capabilities,  (notifications,   (agent state,   (ref:// models,
                  Authorizer,     files, jobs…)     collections)    secrets)
                  MCP, events)        │
                                      ▼ EmailNotificationChannel
                                   MailPort (transport, templates)

  AuthBoundry: contract source and test vectors for principals, delegation and claims. No runtime call.
  stack-agent: external worker over FeltKit's handoff/MCP seam, holding an agent credential.
  AppBoundry:  runs FeltKit artifacts; must carry the same principal and tenant fields.
  * = to be built (phase 2/3)
```

Ownership decisions this implies:
- **FeltKit** owns auth state (accounts, sessions, tenants, memberships, invitations, challenges, delegations) on the app's FeltDB instance. This follows the mission's requirement that FeltKit own the state.
- **AppPort** owns the *wire* contract for principals. `agent` as a principal type and the actor/subject pair belong there, so that FeltKit, AppBoundry and stack-agent agree.
- **AuthBoundry** owns the *definition* of delegation and claims semantics. It does not run in a FeltKit app.
- **MailPort** owns delivery; **AppPort Services** owns notification routing.

## 5. Recommended auth design (phase 2), for decision

### 5.1 Configuration surface: TypeScript, mirroring `use auth`

The requested DSL, expressed in FeltKit's existing configuration language with the same names as AuthBoundry's grammar:

```ts
export const app = feltkit({
  name: "multiplayer",
  auth: {
    providers: ["email", "magic-link", "google", "github"], // email = password; each needs its config or the app refuses to start
    tenant: { name: "workspace", invitations: true, switching: true },
    claims: { role: s.enum(["owner", "admin", "member", "guest"]), plan: s.enum(["free", "pro"]) },
    agents: true,
  },
  mail: { identities: { auth: { from: "Multiplayer <auth@…>" } }, templates: { "auth.magic-link": …, "auth.invite": … } },
  roles: { … }, // unchanged
});
```

Why this form and not a parsed `use auth { … }` file:
- FeltKit's only configuration language is TypeScript. A `.flow` parser would be a second one, which the mission rules out.
- Typed claims become TypeScript types in handlers, the client and React hooks.
- AuthBoundry's parser cannot be reused in-process: it is Rust with no WASM or npm build, and the npm package is `UNLICENSED`.
- The keys match AuthBoundry's grammar. A later `feltkit import auth.flow` can translate a file one-way into this TypeScript config if that is wanted.

### 5.2 State FeltKit adds (system collections, like `_feltkit_sessions`)

| Record | Fields (sketch) | Notes |
|---|---|---|
| Tenant | id, name, createdBy, createdAt, disabledAt | An application can have many |
| Membership | tenantId, principalId, claims (typed), invitedBy, createdAt, removedAt | Claims are per tenant, so a role in one workspace is not a role in another |
| Invitation | tenantId, e-mail, claims, tokenDigest, expiresAt, acceptedAt, revokedAt | Token from `ctx.crypto.token`; single-use; digest only |
| Challenge | purpose (`magic-link`, `code`, `invite`), e-mail, digest, expiresAt, attempts, usedAt | One store for every e-mailed secret |
| Session + tenant | the existing session, plus `tenantId` | Switching re-issues a tenant-scoped session; the old one is revoked |
| Account lifecycle | name and e-mail change (re-verified), disable, delete (tombstone) | Disabling revokes sessions; role and claim changes take effect on the next call (re-resolved, not copied at sign-in) |

Enforcement:
- `AuthorizeRequest` and `ctx.auth` gain `tenant` and `claims`.
- `access` can name a claim requirement, for example `{ claim: { role: ["owner", "admin"] } }`.
- Every system query is tenant-filtered, and crossing tenants fails closed.
- The `authorize` hook keeps working unchanged. Multiplayer's `_authz.ts` membership loader becomes a one-line claim check *(inference: to be measured)*.

### 5.3 Delegation: one model, the AuthBoundry contract, implemented in FeltKit's Authority

The mission requires all three of these, and they conflict:
- reuse AuthBoundry semantics;
- no runtime dependency on AuthBoundry;
- no duplicate authority model.

The resolution I recommend:
- FeltKit stores and evaluates delegations with **AuthBoundry's record shape and rules**: attenuation at creation, chains, expiry, revocation, and task-scoped runs that cannot outlive or widen their delegation.
- Both implementations run **shared conformance vectors**: JSON cases derived from `end_to_end_auth.rs` and `principal_delegation.rs`, committed to AuthBoundry and consumed by FeltKit's tests.
- That keeps it one model with two implementations under one test suite. Without the shared vectors it would drift into two models, so the vectors are the condition for this approach, not an extra.

FeltKit should improve on AuthBoundry in one place: **re-check the delegator's current authority at decision time**, so that demoting a person immediately narrows their agents. AuthBoundry checks only at creation; this should be proposed upstream too.

### 5.4 Challenges: magic link and code

- **What a challenge is.** An opaque 256-bit token or a 6–8 digit code. Codes get the attempt limit.
- **Lifecycle.** Single use, with a TTL of at most 15 minutes. Only the digest is stored. Attempts are limited per challenge and per e-mail. Issuing a new challenge for a purpose supersedes the previous one.
- **Responses.** A uniform reply regardless of whether the account exists.
- **Delivery.** Sent through the existing `sendAccountMail` → AppPort Services notification → MailPort path, using templates. There is no second mail system, and the secret is never stored in the notification record (`render()` at delivery, as verification already does).
- **Throttling fix.** Add a trusted-proxy setting so `X-Forwarded-For` is honoured only from configured proxies.

### 5.5 UI

`@feltdb/feltkit/react` exports:
- `SignIn` (renders the configured providers);
- `AcceptInvitation`;
- `TenantSwitcher`;
- `AccountSettings` (profile, e-mail, sessions, sign out everywhere);
- the matching hooks.

These are the starter template's screens, promoted and themed, so apps stop copying them, as Multiplayer did.

## 6. Recommended agent design (phases 3–4), for decision

### 6.1 Definitions and their lifecycle, on the existing runtime

```ts
export const triage = app.agent({
  name: "support-triage", version: 3,
  job: "Route new support conversations to the right channel and owner.",
  responsibilities: ["classify", "assign", "summarize"],
  personality: { tone: "brief, friendly" },                       // behaviour only; never authority
  capabilities: [api.conversations.assign, api.messages.post],    // the most it may ever do
  approvals: { [api.messages.post.name]: "required" },
  escalation: { to: { claim: { role: ["admin"] } }, when: ["low confidence", "refund requested"] },
  success: ["assigned within 5 min", "owner accepts"],
  model: "ref://models/fast",                                      // Resolver
  triggers: [{ on: api.conversations.create }],                    // FK-GAP-008
});
```

- **Definition.** Developer-owned and versioned in code. It maps onto FeltDB `AgentDefinition` (name, version, capabilities, goals, constraints, approval policies) plus the new fields. A version change is a new definition: existing instances stay pinned until they are moved.
- **Deployment.** A tenant enables a definition. A tenant admin can tune personality, schedules and notification targets, and can *narrow* capabilities. A tenant admin can never widen them: the effective set is `definition ∩ deployment ∩ delegation`.
- **Instance and assignment.** An agent principal (`type: "agent"`) is created per deployment and holds a delegation from the person who deployed it. That delegation is attenuated to the deployer's own authority, and an assignment binds it to a scope (a channel, a queue).
- **Task, interaction and execution.**
  - A task is the existing AgentHost task.
  - An interaction is an end user's thread with the agent, stored as task messages.
  - An execution is an action in the existing proposal → approval → execution lifecycle, run through `Runtime#call` as the agent principal *on behalf of* the delegator.
  - Receipts finally carry `delegatedBy`.
- **There is no new runtime.** Execution stays in AgentHost; stack-agent can be an external executor for a deployment, through the handoff seam, holding an agent credential.

### 6.2 AppPort contract change (upstream, small)

- Add `"agent"` to `Principal.type`.
- Give `delegationId` meaning as an `{ actor, subject, delegationId }` triple on authorization requests.

This lets AppBoundry and stack-agent carry the same identity as FeltKit, without FeltKit's current agent → application mapping. It is proposed as an AppPort PR, which needs review and release.

### 6.3 Triggers (FK-GAP-008)

Triggers are declared on the definition: on a mutation committing, on an event, or on a schedule. They are implemented with the existing after-commit outbox and jobs, so delivery is at least once, the work runs as the agent principal, and it is recovered by the services worker. This closes FK-GAP-008 and lets Multiplayer delete its external worker and queue.

### 6.4 Evaluation

`feltkit agent eval <name>` replays recorded fixtures (task input plus expected decision or outcome) against a definition version and model ref. It uses `createTestApp` and a deterministic `DecisionRuntime` for CI, and a real model on demand. It follows the method of stack-agent's harness, not its code, which is Rust.

### 6.5 Security tests the design must pass (mission Part 6)

Every case below fails closed and leaves a durable audit record:
- unauthenticated access;
- expired or revoked session;
- cross-tenant read or write;
- forged claims in the request body;
- an agent without a delegation;
- an agent exceeding its delegation;
- delegator demoted after delegating (decision-time re-check);
- delegation expired mid-task;
- tool outside the definition;
- approval bypass (agent or API key self-approving);
- disabled agent or deployment;
- version change mid-task (pinned);
- tenant admin widening capabilities;
- end user instructing an agent past its authority;
- a model asserting it is authorized (the decision is ignored as proof).

## 7. Decisions needed before implementation

1. **Configuration surface:** TypeScript `feltkit({ auth })` with AuthBoundry's key names (recommended), or a parsed `use auth` file in FeltKit?
2. **Delegation:** a FeltKit implementation of AuthBoundry's contract with shared conformance vectors (recommended)? The alternative is to wait for a WASM build of AuthBoundry's crates, which needs a licensing and ownership decision on the `UNLICENSED` package.
3. **AppPort principal change:** may I prepare the AppPort PR (`agent` type, actor/subject/delegation) as part of phase 2?
4. **Client session storage:** keep bearer tokens in `localStorage` (status quo, documented), or add an HttpOnly-cookie mode with CSRF protection?
5. **Scope of phase 2:** tenancy, claims, challenges, account lifecycle and UI first (recommended), then agent principals and delegation in phase 3. MFA is out of scope.

## 8. Gaps found that are not in the mission's scope (recorded, not acted on)

- Doc drift: `docs/SECURITY.md:66-71` and `docs/READINESS.md:27` say OIDC is unsupported, but it is implemented.
- FeltKit's MailPort contract is tested only against a fake HTTP server.
- AuthBoundry's session cookie lacks `Secure`, its Google flow lacks PKCE, nonce and id_token checks, and e-mail codes have no TTL.
- AppWorks refuses `stack-agent` as a provider ("no adapter yet"). chip-rs should be archived in favour of stack-agent.
- Multiplayer's personal agents exist only in its schema.
