# FeltKit platform roadmap

> Generated from `feltkit-gaps.json` by `node tools/roadmap-md.mjs`. Edit the JSON, not this file.

Updated 2026-11-05 (round 2 in progress). Evidence: [FELTKIT_GAP_REGISTER.md](FELTKIT_GAP_REGISTER.md) and [FELTKIT_MULTIPLAYER_BUILD_REPORT.md](FELTKIT_MULTIPLAYER_BUILD_REPORT.md).

Ranking criteria, in order: 1. custom code eliminated (measured); 2. apps that benefit; 3. effort saved; 4. security and correctness; 5. architectural importance; 6. implementation complexity (lower first).

Each change lives with the component that owns the concept (FeltKit composes; AppPort, AppPort Services, FeltDB, AuthBoundry and AppBoundry own their primitives).

## Released and adopted

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | feltkit({ authorize }) | FeltKit | @feltdb/feltkit 0.3.16; Multiplayer adopted (enforcement removed from handlers) | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |
| [FK-GAP-010](FELTKIT_GAP_REGISTER.md#fk-gap-010) | ctx.crypto.token + host interface crypto@1 | FeltKit + AppBoundry | @feltdb/feltkit 0.3.16, @appport/appboundry 1.9.0; Multiplayer adopted (256-bit invitation codes) | closed — released in @feltdb/feltkit 0.3.16 and @appport/appboundry 1.9.0 (crypto@1); adopted by Multiplayer (workaround removed) |
| [FK-GAP-017](FELTKIT_GAP_REGISTER.md#fk-gap-017) | AppPort: subscriptions and deliveries authorized by the application Authorizer; scoped events | AppPort | @appport/server 1.2.0 (sdk 1.5.0, core 1.6.0, protocol 1.4.0) | closed — released in AppPort (@appport/protocol 1.4.0, core 1.6.0, server 1.2.0, sdk 1.5.0, authorization 1.0.8) |

## Round 2 — implemented locally, awaiting push, review and release

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-019](FELTKIT_GAP_REGISTER.md#fk-gap-019), [FK-GAP-020](FELTKIT_GAP_REGISTER.md#fk-gap-020), [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | AppPort: core portability, per-connection subscriptions, NOT_FOUND decisions | AppPort | local branch claude/remaining-primitives; release first (unblocks FeltKit's AppPort 1.5 adoption) | closed — released (@appport/core 1.7.0, portability test).; closed — released (@appport/server 1.3.0, per-connection subscriptions); FeltKit also gives each subscription a unique bus id (main 626bccf).; closed — AppPort NOT_FOUND denials released (@appport/authorization 1.1.0, server 1.3.0); FeltKit side merged (PR #62); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). |
| [FK-GAP-021](FELTKIT_GAP_REGISTER.md#fk-gap-021) | Resolver on AppPort 1.5 | Resolver | local branch claude/appport-1.5 | closed — merged (rkendel1/resolver PR #11). |
| [FK-GAP-011](FELTKIT_GAP_REGISTER.md#fk-gap-011), [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | FeltKit: reconnect on online/visible; NOT_FOUND decisions | FeltKit | local branch claude/remaining-primitives (mergeable now) | closed in code — merged (FeltKit PR #62); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05).; closed — AppPort NOT_FOUND denials released (@appport/authorization 1.1.0, server 1.3.0); FeltKit side merged (PR #62); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). |
| [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004) | Ephemeral scoped events (FeltKit app.event + AppBoundry events@1 + AppPort) | FeltKit + AppBoundry + AppPort | local branches; FeltKit's needs the AppPort release | closed in code — AppPort per-subscription authorization + scope released (@appport/server 1.3.0, protocol 1.4.1), AppBoundry events@1 released (@appport/appboundry 1.10.0), FeltKit app.event/useEvent merged (PR #63); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). |
| [FK-GAP-016](FELTKIT_GAP_REGISTER.md#fk-gap-016) | appport add --help and no-terminal refusal | AppPort CLI (in rkendel1/appboundry) | local branch claude/remaining-primitives | closed — released (appport CLI 1.4.0: add --help, refusal without a terminal). |

## Next — small, high leverage

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | optional per-function `resource` declaration so a central policy does not infer resources from argument names | FeltKit | proposed (from consumer acceptance) | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |

## Primitives that remove whole workarounds

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-013](FELTKIT_GAP_REGISTER.md#fk-gap-013) | accounts on AppBoundry (or via AuthBoundry) | AppBoundry | not started | reduced, blocked on a design decision — FeltKit claude/appboundry-gaps (ebf3af9): build warns and the manifest declares identity.accounts/tenancy; AppBoundry (d11fd9b) refuses such artifacts at load unless the operator accepts operator sessions (--accounts operator-sessions). Design: appboundry docs/identity-host-interface.md (accounts@1/tenancy@1 host interfaces running FeltKit's own handlers in the guest; 7 open questions). Owners: AppBoundry (host), FeltKit (guest handlers), Mailerport (mail). Tests: identity-declarations.test.ts (6). |
| [FK-GAP-008](FELTKIT_GAP_REGISTER.md#fk-gap-008) | app agent triggers (run as the agent principal on an event, with leases) | FeltKit + AppBoundry | not started | implemented — rkendel1/feltkit branch claude/gap-008 (00a2ec6, pushed; PR pending): app.agent(name, { principal, roles, on?, handler }) triggered by ctx.afterCommit.agent or app.event, recorded in the mutation's outbox, run at least once as the agent principal (its own roles, never the caller's) with leases and backoff, writes committed at most once (transaction id from the outbox id), restart recovery, tenant only where the agent is a member. AppBoundry: refused at build (needs a host interface). Tests: agents.test.ts (10). |
| [FK-GAP-002](FELTKIT_GAP_REGISTER.md#fk-gap-002), [FK-GAP-003](FELTKIT_GAP_REGISTER.md#fk-gap-003) | AuthBoundry resource evaluation + membership as delegation, consumed through feltkit({ authorize }) | AuthBoundry (+ FeltKit adapter) | FeltKit integration point exists | superseded (2026-11-05 decision) — the wanted outcome (tenant membership and per-resource decisions on the server) is delivered natively by FeltKit (auth.tenant, tenant-scoped collections, the authorize hook; PR #65). The proposed AuthBoundry adapter would make FeltKit depend at runtime on a hosted AuthBoundry service, which the Phase 2 constraints rule out ("FeltKit must remain self-contained"). Delegation for agents acting for a person moves to the agent workstream (AuthBoundry contract implemented in FeltKit, FELTKIT_AUTH_AGENT_STACK_AUDIT.md §5.3). AuthBoundry evaluating `resource` in enforce() remains AuthBoundry's own item.; closed in FeltKit — tenancy primitive (auth.tenant: tenants, memberships, invitations, switching, tenant-scoped collections, typed claims), merged in rkendel1/feltkit PR #65; merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). Multiplayer adoption: Phase 2 migration. |
| [FK-GAP-007](FELTKIT_GAP_REGISTER.md#fk-gap-007) | Files authorized by resource + signed URLs | AppPort Services | not started | closed in code — file links merged (FeltKit PR #64); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). Multiplayer adoption: Phase 2 migration. |

## Architecture and scale

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-009](FELTKIT_GAP_REGISTER.md#fk-gap-009) | managed AppBoundry target (routing/TLS, verified runtime, tokens) | AppBoundry | blocked (infrastructure) | blocked (not actionable under current constraints) — needs Hetzner deployment, which is excluded ("No Hetzner contact or deployment"). Owner: AppBoundry / operator. |
| [FK-GAP-015](FELTKIT_GAP_REGISTER.md#fk-gap-015) | one AppBoundry artifact contract for every producer | AppBoundry + AppPort + FeltKit | not started | reduced — appboundry claude/gaps-013-014-015 (8636580): one recognizer/verifier for both formats; run, artifact verify/inspect, app install/inspect accept both; host loader refuses bundles clearly. Remaining: managed deploy accepts FeltKit artifacts only (AppBoundry); one producer format needs AppPort+FeltKit+AppBoundry agreement. Investigation: appboundry docs/artifact-formats.md. Tests: artifact-formats.test.ts (9). |
| [FK-GAP-005](FELTKIT_GAP_REGISTER.md#fk-gap-005) | predicate-level live-query invalidation | FeltDB (change listener) + FeltKit | not started — reuse FeltDB readBasis (see register) | implemented — rkendel1/feltkit branch claude/gap-005-006 (82dc40e, pushed; PR pending): queries report keyed equality predicates; change events carry per-record HMAC keys (per-process key, never sent); /api/events withholds other tenants' records; watchQuery re-runs on key match. Limits: remote FeltDB stays per collection; writes outside FeltKit's commit path stay per collection. Tests: live-predicates.test.ts (6). |
| [FK-GAP-014](FELTKIT_GAP_REGISTER.md#fk-gap-014) | AppBoundry serves /appport and /mcp | AppBoundry | not started | closed in code — rkendel1/appboundry branch claude/gaps-013-014-015 (dc64f6a, pushed; PR pending): /mcp served from the manifest via @appport/mcp createMcpHandler, same authentication and authorization as /appport. Studio out of scope. Tests: mcp.test.ts (4). |
| [FK-GAP-006](FELTKIT_GAP_REGISTER.md#fk-gap-006) | text predicate / search index | FeltDB + FeltKit | not started | implemented in FeltKit (scan) — branch claude/gap-005-006 (82dc40e): app.collection(..., { search }) + ctx.db.search({ text, where, limit ≤ 100 }), tenant-scoped, live, fenced, works in AppBoundry guests on existing reads; cost linear in the `where` subset (50k cap). A FeltDB text index remains upstream (UPSTREAM-GAPS F23). Tests: search.test.ts (8). |
| [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | AppPort decision code for concealment | AppPort | not started | closed — AppPort NOT_FOUND denials released (@appport/authorization 1.1.0, server 1.3.0); FeltKit side merged (PR #62); merged to FeltKit main (0.3.17 in package.json; npm still 0.3.16 at 2026-11-05). |

## Recorded, not planned

- **FK-GAP-012** Capabilities require hand-written output schemas even when the handler's return type is known — accepted (by design)
