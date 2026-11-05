# Agent and AppPort capability audit

Date: 2026-11-05. Read-only audit. No repository files were modified.

**Status scale:** 1 = implemented and tested · 2 = implemented but incomplete · 3 = contract or schema only · 4 = planned or documented only · 5 = missing.

**Evidence tags:** **[V]** = verified in source or test code during this audit. **[I]** = inference from naming, comments or structure, not executed. No tests were run. "Tested" means a test file and test name were found, not that the test passed.

Heads audited:

| Repo | Commit |
|---|---|
| stack-agent | `c066006` (2026-10-28) |
| chip-rs | `c14522a` (2026-10-16) |
| appworks | `4cc8ea3` (2026-11-03) |
| appport | `ada9157` (2026-11-05) |
| appboundry | `f3fd439` (2026-11-05) |
| resolver | `c61fe14` (2026-11-05) |
| feltkit | `f49d9ac` (2026-11-05) |

The audit also referenced AuthBoundry (`/home/user/authboundry`, `b8ed659`), because AppBoundry and the agent-credential path point to it.

---

## 0. Cross-repo facts that shape everything else

1. **chip-rs is frozen, and stack-agent replaces it [V].**
   - `stack-agent/docs/migration-provenance.md` says every chip-rs crate except `chip-session-memory` was copied from chip-rs `c14522a`. That commit is chip-rs's current HEAD.
   - stack-agent then moved ahead. `chip-core` differs: stack-agent adds `stuck.rs` and changes `work.rs`, `lib.rs` and others.
   - stack-agent also adds crates chip-rs does not have: `chip-agent-state`, `chip-otel`, `chip-cli2`, `chip-experiments`, `chip-appport-source` and `chip-symbol-loop`.
   - Conclusion: chip-rs should be treated as historical. Any reuse targets stack-agent.
2. **FeltDB is already the shared agent-state layer in three of the four agent runtimes [V].**
   - stack-agent: `crates/chip-agent-state` uses the `feltdb = "0.2.0"` crate, contract `feltdb.agent.transition v1`.
   - AppWorks: `@appport/workspace` and `@appport/recipe-runtime` use `@feltdb/core 0.18.0`.
   - FeltKit `ctx.agent` uses `@feltdb/core 0.21.0`, specifically `db.defineAgent`, `createAgentExecution` and `openAgentState`.
3. **The only declarative "agent definition" in any of these codebases is FeltDB's `AgentDefinition` [V]** (`feltkit/node_modules/@feltdb/core/dist/agent.d.ts:43`).
   - Fields: `name`, `version`, `description`, `capabilities[]`, `goals[]`, `constraints{maxLatency, requireFreshState, maxIterations, maxConcurrent}`, `tools[]`, `policies{requireApproval[], forbidden[]}`, `memory{maxSize, retentionMs, scope}`.
   - It has no fields for responsibilities, success criteria, escalation targets, model preferences or authority (principal or delegation).
4. **Agent principals and delegation exist only in AuthBoundry [V].**
   - AppBoundry and FeltKit have an `"agent"` principal type.
   - AppPort's protocol does not: its types are `user | service | device | application`.
   - AuthBoundry has the real pieces: `PrincipalKind::Agent`, a `delegate` primitive, and `aga_` agent credentials (`authboundry/docs/AGENT-CREDENTIALS.md`).
   - Its delegation behavior is tested in `crates/server/tests/agent_credentials.rs`: `a_delegation_carries_no_authority_once_its_human_delegator_has_lost_it`, `revoking_the_delegation_itself_takes_effect_on_the_next_decision`.

---

## 1. Stack-Agent (`/home/user/rkendel1/stack-agent`)

**Runtime profile:**

- **Language:** Rust (edition 2024), a 33-crate workspace.
- **Execution boundary:** one OS process.
  - Capabilities run through a `WorkEnvironment` / `EnvironmentProvider` (`chip-core/src/environment.rs`): local project root, Compute CLI, or a remote `exec(argv, env)` transport.
  - Project file access is confined to one root (`chip-project/src/confine.rs`).
  - Tests run through an external `pax` binary.
- **How it is invoked:**
  - As a CLI (`stack-agent work|verify|serve|doctor`).
  - As an HTTP service (`serve`: `POST /v1/work`, `GET /v1/work/{id}`, `/events` (SSE), `/cancel`, `/v1/metrics`, `/health`; `crates/stack-agent/src/service.rs`).
  - As a library: `chip_core::Agent` with injected ports. The library route is Rust-only, with no npm or FFI surface.
- **Published?** No crates.io package was found. FX crates set `publish = false`. Distribution is a GitHub release binary plus `install.sh` (README) [V].
- **FeltKit integration:** none. A grep for "feltkit" returns 0 files [V].
- **AppPort integration:**
  - **Product path [V]:** `crates/stack-agent/src/host_capabilities/appport.rs`, enabled by `--appport <origin>` (`software_work.rs:3691`).
    - Discovers `/.well-known/appport` in both the `appport/1` and `AppPort/host-discovery/1` forms.
    - Treats the manifest as the contract.
    - Pins `capabilityDigest` and checks it again before each call.
    - Sends a `Bearer` token from `token_env`, plus `x-appport-scopes`.
  - **Experiment only [V]:** crate `chip-appport-source`, which includes an MCP transport.

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Agent definition format (job, responsibilities, authority, success criteria, escalation, approvals, model prefs, versioning) | 5 | No `AgentDefinition`, persona or role type exists. The closest are `WorkSpec`, `WorkGoal` and `WorkLimits` (`chip-core/src/work.rs:1721`) [V] | `WorkSpec{goal, limits, required_outputs, required_observations, required_answers, ...}` | none | A work is defined per run. Success criteria exist as `required_outputs` and `required_observations` predicates. There is no persistent agent identity or versioned definition. Skills (`chip.skill.v1`) are experimental, inert instruction text (`src/skill_experiment.rs`) |
| Deployment / instance / assignment | 2 | `serve` with tenants: `src/tenancy.rs` (`chip.tenants.v1`, `chip.profiles.v1`). Test `tests/serve_tenants.rs::a_tenant_runs_work_in_its_workspace_and_no_other_tenant_can_see_or_stop_it` [V] | `serve --tenants FILE`, profiles file | sha2 | Tenants are operator-issued tokens with a workspace root and limits. Tenant works are not durable (`durable: false`, per a doc comment in tenancy.rs). There is no agent-instance or assignment concept |
| Task model | 1 | `WorkSpec`, `WorkOutcome` (Completed / Escalated / Blocked / LimitReached / Failed / Cancelled) in `chip-core/src/work.rs:180`. Durable task, intents and outcomes in `chip-agent-state` (15 test files) [V] | `Agent::run_work`, `WorkReport` | FeltDB crate 0.2.0 | Strongest typed lifecycle of the runtimes audited |
| Interaction / conversation model | 2 | `chip-turns`, `chip-session` (reads Zig fx `event_log_v1`). `Turn{user_message, instructions}` [V] | `Agent` turn API | – | Single-shot prompt and turn sessions. Interactive approval and conversation are listed as unsupported in chip-rs `README.md` "Known limitations" [V] |
| Execution loop | 1 | `chip-core` bounded loop. Decisions are `WorkDecision::{Complete, Escalate, Block, RequestCapability}` (`work.rs:118`), one capability per turn. Tests include `chip-core/tests/work_loop.rs` and `tests/stuck_guard.rs` [V] | `Agent`, `WorkDecisionBoundary`, `LocalWorkPolicy` | chip-inference | No separate planner. The model gives one decision per turn, and local policies (`LocalWorkPolicy`, `WorkflowPolicy` in `src/workflow_exec.rs`) can propose first. Parallel and provider-native tool calls are unsupported (README limitations) [V] |
| Model providers, replaceable? | 1 | `chip-inference::ModelProvider` trait (`lib.rs:279`). `fx-native-provider/src/{openai.rs, anthropic.rs}`. Tests `fx-native-provider` (8 files), `tests/byo_model.rs` [V] | `ModelProvider` trait, `CHIP_MODEL` / `CHIP_ENDPOINT` env, profiles | ureq, rustls | Provider-neutral port: OpenAI-compatible and Anthropic native, with a typed `Delivery` certainty. Local reasoners can be WASM or ML (`chip-local-decision`, `chip-wasm-reasoner`) |
| Tool discovery vs invocation authority | 1 | `CapabilityProvider` (discovery only) is separate from `Executor` (`lib.rs:430,630`). `Withheld` and `CapabilityWithheld` record "discovered but not authorized". AppPort operator pins and scopes (`host_capabilities/appport.rs:500` "Discovery grants nothing"). Tests in `tests/host_capabilities.rs`: `required_pins_withhold_an_unpinned_capability`, `a_desktop_host_needs_a_reviewed_manifest_and_sends_the_granted_scopes` [V] | `CapabilityDescriptor{effect, idempotency, version}` | – | Effect (`Observation` / `Consequential` / `Unknown`) and `Idempotency` are declared by the adapter, never by the model |
| Approvals / HITL | 2 | Only through the cli2 backend: `chip-cli2/src/approval.rs` (`Approver`, `DenyAll` default, approval bound to the plan digest). Tests `chip-cli2/tests/backend.rs::a_declined_approval_runs_nothing_retires_the_plan_and_is_a_rejection`, `by_default_nothing_that_needs_approval_runs` [V] | `Approver` trait, `PlanReview` | cli2 local protocol | Not a general approval gate on the core loop. chip-rs README lists "interactive approval" as unsupported [V] |
| Escalation | 2 | `WorkDecision::Escalate` gives terminal `Escalated`. `chip-local-decision` is a Continue/Escalate classifier [V] | `WorkOutcome::Escalated{reason}` | – | Escalation ends the work. There is no route to a person or queue [I] |
| Agent identity / principal / delegation | 5 (agent) / 2 (caller) | Caller identity is limited to tenant tokens (`tenancy.rs`, SHA-256 of an operator-issued token). Outbound to AppPort is an operator `token_env` bearer plus static scopes (`host_capabilities/mod.rs:128`, `appport.rs:786`). No `aga_` or AuthBoundry use (grep: 0) [V] | – | – | The agent acts with whatever credential the operator configured. There is no on-behalf-of. The `principal` string appears only in the experiment crate `chip-appport-source/src/mcp.rs:541` [V] |
| Audit trail / evidence | 1 | `WorkEvent` stream, `ExecutionEvidence`, `audit_safety`, `verify_trajectory` (`work.rs:1436`). FeltDB persistence. OTLP export (`chip-otel`, 5 test files). Tests include `tests/durable_events.rs`, `tests/telemetry_export.rs` [V] | `WorkReport`, `/v1/work/{id}/events` | FeltDB, OTLP JSON | Strongest evidence model: a model's words are never treated as evidence |
| Evaluation harness | 1 | `chip-experiments` (controlled A/B), `agent_bench.rs`, `corpus_eval.rs`, `chip-reasoning-corpus`, `chip-decision-corpus`, `bench/` [V] | `stack-agent` bench subcommands [I] | – | Opt-in, and not on the production path |
| Memory | 2 | Episodic recall: `WorkSpec.recalled` (≤3 episodes, ≤480 B each). Tests in `tests/episodic_memory.rs`: `a_verified_episode_survives_restart_and_only_a_matching_work_is_told_of_it` and 6 others [V] | `RecalledEpisode` | FeltDB | Bounded recall of past outcomes only. No semantic or long-term memory. `chip-session-memory` was not migrated |
| Scheduling / triggers | 5 | No cron or schedule in source (grep hits only bench/experiment) [V] | – | – | Driven only by CLI or HTTP submission |
| Sandboxing | 2 | Project-root confinement (`chip-project/src/confine.rs`, "descriptor-based confinement on Unix"). `chip-remote-env`. WASM hosts run under `wasmi` in tests only (`docs/known-issues.md` §G, §J) [V] | `EnvironmentProvider` | – | Known issue J: "verifying a repository still runs its own code (HA-01)" |
| Cancellation / limits | 1 (cancellation partial) | `WorkControl`, `StopCause`, `WorkLimits`. `tests/cancellation.rs`, `tests/abort_in_flight.rs` [V] | – | – | known-issues §B: executions in flight are not interrupted by default |

## 2. Chip (`/home/user/rkendel1/chip-rs`)

**Runtime profile:**

- **Language:** Rust, 22 crates.
- **Execution boundary:** same as stack-agent (`chip work`, `chip serve`).
- **Published?** No. Released as a `chip` binary archive.
- **FeltKit integration:** none (grep 0) [V].
- **AppPort integration:** none functional. AppPort appears only in architecture-isolation tests, as a forbidden dependency name: `crates/chip-core/tests/architecture.rs:37` [V].

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| All primitives in §1 (loop, capability port, evidence, providers, escalation) | Same as stack-agent's older snapshot | Identical crate lineage (`migration-provenance.md`). 40 test files in `chip-core/tests` [V] | `chip_core::Agent`, `chip_cli::service::serve_in` | FX via git pin to `rkendel1/fx` [I, per provenance doc] | Missing compared with stack-agent: durable FeltDB state (`chip-agent-state`), OTel, cli2 approvals, AppPort host capabilities, experiments, stuck guard, episodic recall |
| Approvals / HITL | 5 | README "Known limitations": interactive approval is unsupported [V] | – | – | – |
| Memory | 5 | `chip-session-memory` was excluded from the workspace (it depends on private `flow_db`) [V] | – | – | – |
| Agent identity / principal | 5 | – | – | – | – |

**Recommendation:** do not build on chip-rs. It is the predecessor snapshot of stack-agent. HEAD equals the migration source commit [V].

## 3. AppWorks (`/home/user/rkendel1/appworks`)

**Runtime profile:**

- **Language:** TypeScript (Node ≥20 or 22.13), a pnpm monorepo.
- **Execution boundaries:**
  - **`@appport/workspace` agent runner:** in-process orchestrator over a FeltDB workspace. The agent may only request registered actions, and there is no shell or network tool (`packages/workspace/src/agent/actions.ts` header) [V].
  - **`@appport/recipe-runtime`:** durable recipe execution. Every capability call goes through a `CapabilityGateway` to AppPort (`src/gateway.ts`) [V].
- **How it is invoked:** as libraries, plus the CLIs `appworks agent`, `appworks recipe` and `appworks serve`.
- **Published?**
  - Private: `@appport/workspace` and `@appport/recipe-runtime` (`"private": true`) [V].
  - Published: `@appport/recipe`, `@appport/recipe-distribution`, `@appport/assessment` and `@appport/extraction`, per the README [I: publishing not verified].
- **FeltKit integration:** none functional. The only hits are vendored stack-ui brand tokens [V].
- **AppPort integration:** deep [V].
  - `@appport/client`, `@appport/protocol`, `@appport/schema` and `@appport/core`.
  - `recipe-runtime/src/appport-gateway.ts` asks AppPort to authorize each binding at invocation time.
- **Note:** `packages/workspace/src/agent/config.ts` explicitly refuses `provider === "stack-agent"`. Its message: "stack-agent has no AppWorks adapter yet; it will plug in behind the appworks.agent/1 contract" [V].

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Agent definition format | 3 (adapter contract, not a definition) | `appworks.agent/1` (`workspace/src/agent/contract.ts`): `AgentIdentity{provider, implementation, model}`, `AgentCapabilities{statefulSessions, cancellation, usage, local, model}` [V] | `AgentAdapter.decide(AgentRequest) → AgentResponse` | @appport/schema | Describes the decision engine, not a job, role or responsibilities. No versioned agent definition |
| Deployment / instance / assignment | 2 | Agent run records, one run per project via a claim: `agent.test.ts::"refuses a second run on a project another run holds, from this or another runtime"` [V] | `AgentRunner.start(principal, projectId, {agent})` | FeltDB | A run is assigned to a project. There is no standing agent instance |
| Task model | 1 (domain-specific) | `AgentRequest{task, context, actions, history, constraints}`. Workflow stages in `workflow.ts` [V] | – | – | Hard-wired to the extraction workflow, not generic |
| Interaction model | 1 | Decision `ask` pauses the run for a human answer: `agent.test.ts::"pauses for a question, resumes only with an answer, and gives the answer to the agent"` [V] | `AgentDecision = action \| ask \| finish` | – | – |
| Execution loop | 1 | `agent/runner.ts` (595 LOC). One decision per turn, validated by `validateResponse` before execution: `agent.test.ts::"rejects unknown actions, invalid arguments and malformed responses..."` [V] | `AgentRunner` | – | Same "model proposes one action, host validates and executes" shape as Chip and FeltKit |
| Model providers, replaceable? | 1 | `agent/providers/{anthropic, openai, deterministic, fake}.ts`. `agent-conformance.test.ts` (13 tests) [V] | `APPWORKS_AGENT_PROVIDER` | `@anthropic-ai/sdk 1.4.0`, `openai 7.47.0` | Never falls back to another provider. Switching agent mid-run must be explicit: `"refuses to resume with another agent unless the switch is explicit"` [V] |
| Tool discovery vs invocation authority | 1 | `ActionDefinition{authority, approval, sideEffect, idempotent}` (`agent/actions.ts`). `Authority.decide(principal, action, resource)` (`src/authority.ts`) [V] | `Authority`, `localAuthority` | – | Actions are offered per turn according to stage. Authority is checked separately by the workspace |
| Approvals / HITL | 1 | Workflow: `agent.test.ts::"carries a project ... pausing only at each approval a person must grant"`, `"never executes on an approval of a subject that changed"`. Recipe: `recipe-runtime/test/runtime.test.ts::"waits for approval without submitting, enforces who may answer, and submits once approved"` [V] | Recipe `task` step with `approval: true` and `assignee` | FeltDB | Approval is separate from authority |
| Escalation | 2 | `finish{outcome:"blocked"}` and `ask` [V] | – | – | No escalation target or route |
| Agent identity / principal / delegation | 2 | `Principal{id, kind: "user" \| "service"}` (`workspace/src/model.ts:29`). No agent kind. The run records `startedBy: principal.id` (`runner.ts:215`). Per the `authority.ts` comment, an AuthBoundry HTTP authority "can stand behind the same port" [V] | `Authority` port | – | The agent acts as the principal who started the run (implicit on-behalf-of) [I]. No credential for the agent itself |
| Audit trail / evidence | 1 | Turn records with `ActionOutcome.class` (workflow-record / source-observation / human-answer). Recipe invocation intent and outcome ledger: `runtime.test.ts::"a worker that dies after the provider committed ... never calls again"` [V] | – | FeltDB | – |
| Evaluation harness | 2 | `agent-conformance.test.ts`, `aider-e2e.test.ts`, `memos-e2e.test.ts` [V] | – | – | Conformance tests for adapters only, no benchmark |
| Memory | 5 | Full history is resent each turn (contract comment). No memory store [V] | – | – | – |
| Scheduling / triggers | 5 | Lease and recovery exist, but no scheduler [V] | – | – | – |
| Sandboxing | 2 | Isolated checkout or worktree, sensitive-path deny-list (`actions.ts` `SENSITIVE`), no shell tool [V] | – | – | Process-level isolation was not verified [I] |

## 4. AppPort (`/home/user/appport`)

**Runtime profile:**

- **Language:** TypeScript.
- **Published packages [V, version fields]:**
  - `@appport/protocol 1.4.0`
  - `@appport/core 1.6.0`
  - `@appport/sdk 1.5.0`
  - `@appport/server 1.2.0`
  - `@appport/authorization 1.0.8`
  - `@appport/mcp 1.3.6`
  - `@appport/client 1.1.6`
  - Also published: integration, schema, testing, generators, mobile and contract-builder.
- **Execution boundary:** in-process application dispatch (`AppPortApplication.handleRequest`) over HTTP, WebSocket, IPC (Electron or Tauri) or in-process transports.
- **FeltKit integration:** only a `RELEASE_NOTES.md` mention. FeltKit consumes AppPort, not the other way round [V].

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Capability discovery | 1 | `/.well-known/appport`, manifest. Tests `sdk/test/discovery.test.ts::"keeps AppPort.discover usable without manual transport wiring"`, `core/test/canonical-discovery.test.ts`, `core/test/pr21-discovery.test.ts` [V] | `AppPort.discover`, manifest | – | Discovery carries effect and authorization semantics: `dispatch.test.ts::"publishes effect and authorization semantics in the generated manifest"` [V] |
| Invocation | 1 | `core/src/invocation.ts`. `pr24-invocation.test.ts::"demonstrates complete chain: RESOLVE → AUTHORIZE → INVOKE"`, `"rejects invalid input BEFORE implementation executes"`, `"propagates cancellation signal"` [V] | request/response envelopes (`protocol/src/envelopes.ts`) | – | Idempotency: `core/test/idempotency-*.test.ts` |
| Authorizer contract | 1 | `authorization/src/index.ts:116` `interface Authorizer { name; authorize(AuthorizationRequest) }`. `AuthorizationRequest{capability, required, session, principal, input, transport, applicationId, requestId}`. Decision is `allowed`, or denied with `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND`. Tests `core/test/dispatch.test.ts::"does not execute protected capabilities when no authorizer is configured"`, `"denies unauthenticated callers with UNAUTHORIZED and unprivileged ones with FORBIDDEN"` [V] | `permissionAuthorizer`, `combineAuthorizers`, `authorizerFrom`, `AuthorizationContext` | – | Consequential capabilities must declare authorization: `dispatch.test.ts::"rejects a consequential capability without an explicit authorization declaration"` [V] |
| Durable grants / revocation | 1 | `core/src/authorization-grant.ts`. `pr41-authorization-grant.test.ts::"authorizes only while a grant is current and denies revoked or ungranted subjects"` [V] | – | – | Grants are made to consumer incarnations (application to provider), not to agents |
| Principals | 1 (no agent type) | `protocol/src/session.ts:9` `Principal{id, type: "user" \| "service" \| "device" \| "application", displayName, attributes}` [V] | `Principal` | – | **No `agent` type.** AppBoundry maps its `agent` to AppPort `application`, with the original type kept in `attributes.appboundryType` (`appboundry-host/src/appport.ts:40-55`) [V] |
| Sessions | 1 (in-memory default) | `core/src/sessions.ts`: `SessionStore`, `MemorySessionStore`. `Session{id, principal, applicationId, expiresAt, permissions}` [V] | `SessionStore` | – | AppPort does not authenticate. It "does not prescribe how a principal authenticated" (session.ts comment) [V] |
| Delegation / on-behalf-of | 3 | `ExecutionIdentity.delegationId?` and `AuthorizationDecisionReference.principalId/sessionId` are declared in `protocol/src/authorization.ts:32-38`. A grep of every `packages/*/src` shows `delegationId` is never read or written anywhere else [V] | type only | – | A schema hook only. No actor/subject pair and no delegation chain |
| MCP exposure | 1 | `@appport/mcp`: `createMcpServer` and `createMcpHandler`. Tools are derived from the manifest and dispatched through `handleRequest`. Tests `mcp/test/bridge.test.ts::"keeps authorization intact for agents"`, `"validates tool input through the capability schema"`; `http.test.ts::"reads host credentials from headers and dispatches as that caller"`, `"accepts host-verified authInfo as the second argument"` [V] | `createMcpServer(app, options)` | `@modelcontextprotocol/sdk` | An MCP agent is authenticated as whatever principal the host verifies. There is no agent-specific handling |
| Events | 1 | `core/src/events.ts` (`EventFilter{name, version, scope}`). `server/test/subscriptions.test.ts::"refuses an exact subscription the principal may not observe"`, `"does not deliver events a wildcard subscriber may not observe (§21.7)"` [V] | `app.emit`, subscriptions | – | Usable as an agent trigger source [I] |
| Agent runtime | 5 | AppPort explicitly leaves "agent tools" to layers built on top (`spec/appport-1.0.md:105`) [V] | – | – | Correct by design |

## 5. AppBoundry (`/home/user/appboundry`)

**Runtime profile:**

- **Language:** TypeScript host. The guest is WASM: `module.wasm` imports nothing, and the host provides host interfaces (`identity@1`, `transactions@1`, `events@1`, `crypto@1`).
- **Execution boundary:** WASM guest inside `appboundry-host`. Managed deployments run in "hardened containers", per the `@appport/appboundry-agent` description [V].
- **Packages [V]:**
  - Published: `@appport/appboundry 1.9.0` and `appport 1.3.1` (the CLI).
  - Private: `@appport/appboundry-host`, `-runtime` and `-agent` (all 0.1.0).
- **Note:** `@appport/appboundry-agent` is a deployment or host agent (it pulls deployment intents and verifies artifacts). It is not an AI agent [V].
- **FeltKit integration:** yes [V].
  - `packages/appboundry/README.md:34`: "FeltKit's `feltkit build --target appboundry` produces one".
  - The host mirrors FeltKit semantics: `ctx.crypto.token`, `app.event`, `ctx.db.sequence`, `ctx.afterCommit`.
  - Parity is enforced by FeltKit's `tests/e2e/transactions-parity.test.mjs`, according to the README [I: the parity test was not opened].
  - FeltKit has `packages/sdk/test/appboundry.test.ts` [V].
- **AppPort integration:** the host serves AppPort (`appboundry-host/src/appport.ts`), and the runtime is built on `@appport/core` [V].

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Identity model (operator-issued sessions) | 1 | `appboundry-host/src/identity.ts`. Users are created by operators. Tokens are `abs_` (user) and `abo_` (operator), 256 bits, stored only as SHA-256, and every session expires. Dev sessions are refused outside development. Tests `production-ops.test.ts::"has no dev sign-in and no users until an operator creates them"`, `"assigns only declared roles, resolves roles on every request, and revokes at once"`, `"answers the local socket, and an operator token over HTTP, never an application token"` [V] | `Identity.issue`, `appboundry admin sessions issue --user <id>` | FeltDB | Roles come from the manifest, and permissions from roles |
| Principals | 1 | `Principal{id, type: "user" \| "agent" \| "service", roles}` (`identity.ts:38`). `admin.ts:185` validates the type. Test fixture `artifact-host.test.ts:35`: `{ id: "helper", type: "agent", roles: ["agent"] }` [V] | – | – | **Has an agent principal type.** It is mapped to AppPort `application` at the boundary [V] |
| Agent authentication via AuthBoundry | 1 | `packages/cli/src/authority.ts`: `APPPORT_AUTHBOUNDRY_AGENT_MODE=required` accepts only `x-authboundry-agent-credential: aga_…`, with no fallback to session authentication. Tests `cli/test/authority-agent.test.ts::"lets a provisioned agent invoke its permitted capability, with the principal and decision recorded and correlated"`, `"refuses an unknown, revoked, replayed and suspended-agent credential..."`, `"refuses a credential bound to another tenant"` [V] | env `APPPORT_AUTHBOUNDRY_*` | AuthBoundry (HTTP) | This is the only tested end-to-end path where an agent proves its own identity to an AppPort host |
| Delegation / on-behalf-of | 5 (in AppBoundry) | Not in the AppBoundry source. Delegation is evaluated inside AuthBoundry (see §0.4) [V] | – | AuthBoundry | – |
| Accounts / tenancy | 2 | The host's `tenantId` is the application id (`appboundry-host/src/services.ts:112`). `apps/cloud-platform` is a Next.js portal with `auth/` and `session/` proxy routes [V]. Organizations and tenants come from AuthBoundry (`authboundry/apps/web/app/api/organizations`) [I] | – | – | The host has no account system of its own |
| Sandboxing | 1 | WASM guest with no imports. `isolation-boundary.test.ts`, `memory-boundary.test.ts` [V] | – | – | Strongest sandbox of the repos audited |
| Events | 1 | `events.test.ts::"observation: access (roles), then the guest's decision for the scope"` [V] | `events@1` | – | – |
| Agent runtime | 5 | – | – | – | Not an agent runtime |

## 6. Resolver (`/home/user/resolver`)

**Runtime profile:**

- **Language:** TypeScript.
- **Packages [V]:** `@appport/resolver 0.2.0` (server), `@appport/resolver-client 0.2.0` and `@appport/resolver-core 0.1.0`.
- **Execution boundary:** an HTTP service. Clients resolve `ref://…` names at run time.
- **FeltKit integration:** yes [V].
  - FeltKit `runtime/decisions.ts` imports `ResolverClient` from `@appport/resolver-client`.
  - FeltKit has `tests/e2e/resolver-switch.test.mjs`.
  - Resolver's `packages/server/test/security.test.ts:62` has a comment noting a credential-cache bug "Seen from FeltKit".
- **AppPort integration:** `agent` refs are discovered over AppPort, and pinned digests are recomputed (README table) [V].

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Model reference resolution (model preference) | 1 | README `model` kind: `{provider, model, endpoint?, credential?, options?}`, checked against the AppPort Services intelligence catalog. `core/test/core.test.ts` [V, file]; individual test names were not enumerated | `resolver.model('ref://…', {key})` | AppPort Services catalog | Supports weighted and failover traffic steering. **This is the natural home for an agent's "model preferences"** |
| Agent endpoint resolution | 1 | Kind `agent`: `{origin, application?, capabilities?}`. Tests `server/test/agents.test.ts::"accepts an agent that serves the pinned contract and moves consumers when it is replaced"`, `"refuses an agent whose contract differs from the pin..."`; `outbound.test.ts::"an agent binding at an internal address is refused..."` [V] | `ref://…` kind `agent` | AppPort discovery | Here "agent" means an AppPort-serving endpoint with pinned capability digests. It is location resolution, not authorization or an agent definition |
| Secrets | 1 [I] | README `secret` kind (write-only vault) | – | – | Test names were not enumerated |
| Capability authorization | 5 | Resolver resolves *where*, never *whether* [I, from README scope] | – | – | It is not an authority |

**Relevance:** high for **model selection** and **agent-endpoint indirection**, and for swapping providers without a redeploy. FeltKit already uses it for models. It is not relevant to authority, approvals or the execution loop.

## 7. FeltKit `ctx.agent` (`/home/user/feltkit/packages/sdk/src/runtime/agent.ts`, `decisions.ts`, `authority.ts`)

Included here to show overlaps. Language: TypeScript, inside the FeltKit runtime.

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Agent definition | 2 | `AgentHost.define()` calls `db.defineAgent({name: "feltkit", version: 1, capabilities, goals, constraints: {maxIterations: 20}, policies: {requireApproval: consequential tools}})` (`agent.ts:304`) [V] | One built-in agent per app. No multiple or specialized agents. Uses FeltDB's definition |
| Task model / lifecycle | 1 | `createTask`, `propose`, `approve`, `reject`, `retry`, `resolve`, `complete`, `cancel`, `reconcile` on FeltDB executions. `test/agent.test.ts` (9 tests) [V] | – |
| Execution loop / planner | 2 | "FeltDB has no planner, and FeltKit adds none" (header). Playbooks (`diagnose-job`, `diagnose-delivery`, `inspect-app`, `invoke`, `decide`, `handoff`) plus a model *choice* among options the code supplies (`decide`, `DecisionSpec`) [V] | No open-ended tool loop. Open-ended work is handed off over MCP to an external agent (Claude Code, Codex or Stack-Agent, per `docs/AGENT-OPERATIONS.md:106`) [V] |
| Providers | 1 | `decisions.ts`: FeltDB `DecisionRuntime`. OpenAI / OpenAI-compatible / Anthropic. Selection via AppPort Services Intelligence and Resolver. `test/decisions.test.ts` (13 tests) [V] | – |
| Authority / approvals | 1 | Each action runs as the task owner through AppPort dispatch. Consequential actions need a human who is also authorized. `separateApprover` option. Tests `agent.test.ts::"the agent enforces the same authority as every other interface"`, `"handoff to an external agent over MCP: claim, context, propose; no approve tool"`, `"a pending approval survives a restart..."` [V] | Implicit on-behalf-of the owner. Not a formal delegation record |
| Principal | 1 | `PrincipalType = "user" \| "agent" \| "service"` (`authority.ts:23`) [V] | Matches AppBoundry |
| Handoff / memory | 1 | FeltDB `openAgentState`: checkpoints, task memory, leased handoffs [V] | – |
| Evaluation / scheduling | 5 / 2 | No eval harness found. A decision can start after a commit (`runtime.ts:1102` `startAfterCommit`) [V] | Event trigger only, no cron for agents [I] |

---

## Which existing runtime should FeltKit specialized agents reuse, and why

**Short answer:** do not create a new agent runtime, and do not adopt stack-agent or AppWorks as FeltKit's in-process runtime. Extend FeltKit's existing `ctx.agent` (`AgentHost`), which is built on **FeltDB agent state, AppPort dispatch and Resolver**. Treat stack-agent as an *external worker* reached through the handoff/MCP seam FeltKit already has. Take identity and delegation from **AuthBoundry**.

### Evidence-based reasoning

1. **FeltKit already has the agent runtime it needs [V].**
   - `AgentHost` already does lifecycle, approvals, authority-as-owner, redaction, handoffs and model decisions.
   - It does this on the same FeltDB instance and through the same AppPort pipeline as every other interface (test `"the agent enforces the same authority as every other interface"`).
   - A "specialized agent" is mostly a different `AgentDefinition` (capabilities, goals, policies) plus playbooks or decision specs. Adding a second runtime would duplicate approvals, the evidence model and authority.
2. **stack-agent is the best open-ended *executor*, but it lives behind a process boundary [V].**
   - It is Rust, with no published crate, no npm binding and no FeltKit integration.
   - Its strengths are the strictest evidence and verification model, typed delivery certainty, provider neutrality, an eval harness, and an AppPort client with digest pins.
   - These strengths fit the role FeltKit's docs already give "Stack-Agent": an external coding agent that claims a handoff and *proposes* actions. FeltKit approves and executes those proposals.
   - It can also call FeltKit apps directly through AppPort (`--appport <origin>`). But it authenticates only with a static operator bearer (`token_env`), not as an agent principal.
   - **Gap to close:** give stack-agent's AppPort source an `aga_` agent credential (AuthBoundry), so its calls carry an agent identity.
3. **AppWorks is domain-specific, and its agent contract duplicates FeltKit's [V].**
   - `appworks.agent/1` (action / ask / finish with history) is the same shape as FeltKit's propose/decide, and the same as Chip's `WorkDecision`.
   - Its runner is wired to the extraction workflow, and its packages are private.
   - It already plans a stack-agent adapter (`agent/config.ts`). Its recipe runtime (durable steps, approval tasks with assignees, intent/outcome ledger, AppPort gateway) is the most reusable piece for multi-step, approval-gated business workflows. But it is `private: true`.
4. **chip-rs: do not use [V].** stack-agent replaces it; its HEAD is the migration source commit.
5. **Identity and delegation should come from AuthBoundry [V].**
   - AppPort has no `agent` principal type and only an unused `delegationId?` field.
   - AppBoundry and FeltKit have `type: "agent"`, and AppBoundry already accepts AuthBoundry `aga_` credentials, with tests.
   - AuthBoundry has `PrincipalKind::Agent`, `delegate` and revocation semantics, with tests.
   - **Recommendation:** add `"agent"` to AppPort `Principal.type` and give `delegationId` real behavior, an actor/subject pair. Do not invent a FeltKit-local delegation model.
6. **Model preferences belong in Resolver `model` refs [V].** FeltKit already resolves them. A per-agent preference should be a `ref://` name in the agent definition.

### Overlap and duplication map (avoid a second runtime)

| Concern | stack-agent | chip-rs | AppWorks | FeltKit ctx.agent | Keep |
|---|---|---|---|---|---|
| Decision shape (one action per turn, host validates) | `WorkDecision` | same (older) | `AgentDecision` (`appworks.agent/1`) | `propose` / `DecisionSpec` | FeltKit, for in-app work. stack-agent as an external proposer |
| Durable agent state | FeltDB crate 0.2.0 (`feltdb.agent.transition v1`) | none | FeltDB TS 0.18 (own records) | FeltDB TS 0.21 (`defineAgent`, `openAgentState`) | FeltDB. Align versions and contracts |
| Model provider adapters | Rust OpenAI + Anthropic | same | TS Anthropic + OpenAI SDKs | TS OpenAI-compatible + Anthropic via FeltDB `DecisionRuntime` + Resolver | Three implementations exist. Do not write a fourth. Keep FeltDB `DecisionRuntime` + Resolver for TypeScript |
| Approvals | cli2 only (plan digest) | none | workflow and recipe approvals | consequential needs an authorized human | FeltKit's (and AppWorks recipe approvals for multi-step flows) |
| Authority | operator token + scopes | none | `Authority` port (local, or AuthBoundry later) | AppPort authorizer as owner | AppPort Authorizer + AuthBoundry |
| AppPort client | Rust `host_capabilities/appport.rs` | none | `@appport/client`, `@appport/core` | in-process dispatch | in-process for FeltKit. stack-agent's client for external work |
| Evaluation harness | yes (experiments, benches, corpora) | partial | adapter conformance tests | none | Reuse stack-agent's harness for agent evaluations |
| Escalation | terminal `Escalated` | same | `ask`, `finish:blocked` | `ESCALATE` option to a person | FeltKit. Add a named escalation target |

### Missing everywhere (status 5 across all repos)

- An agent definition with responsibilities, success criteria, escalation targets, model preference and authority.
- Agent instance/assignment, as distinct from runs.
- Scheduling or cron triggers for agents.
- A formal on-behalf-of chain outside AuthBoundry.
- Long-term or semantic memory. stack-agent has only bounded episodic recall.
