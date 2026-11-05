# FeltKit platform roadmap

> Generated from `feltkit-gaps.json` by `node tools/roadmap-md.mjs`. Edit the JSON, not this file.

Updated 2026-11-05 (after release). Evidence: [FELTKIT_GAP_REGISTER.md](FELTKIT_GAP_REGISTER.md) and [FELTKIT_MULTIPLAYER_BUILD_REPORT.md](FELTKIT_MULTIPLAYER_BUILD_REPORT.md).

Ranking criteria, in order: 1. custom code eliminated (measured); 2. apps that benefit; 3. effort saved; 4. security and correctness; 5. architectural importance; 6. implementation complexity (lower first).

Each change lives with the component that owns the concept (FeltKit composes; AppPort, AppPort Services, FeltDB, AuthBoundry and AppBoundry own their primitives).

## Released and adopted

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | feltkit({ authorize }) | FeltKit | @feltdb/feltkit 0.3.16; Multiplayer adopted (enforcement removed from handlers) | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |
| [FK-GAP-010](FELTKIT_GAP_REGISTER.md#fk-gap-010) | ctx.crypto.token + host interface crypto@1 | FeltKit + AppBoundry | @feltdb/feltkit 0.3.16, @appport/appboundry 1.9.0; Multiplayer adopted (256-bit invitation codes) | closed — released in @feltdb/feltkit 0.3.16 and @appport/appboundry 1.9.0 (crypto@1); adopted by Multiplayer (workaround removed) |
| [FK-GAP-017](FELTKIT_GAP_REGISTER.md#fk-gap-017) | AppPort: subscriptions and deliveries authorized by the application Authorizer; scoped events | AppPort | @appport/server 1.2.0 (sdk 1.5.0, core 1.6.0, protocol 1.4.0) | closed — released in AppPort (@appport/protocol 1.4.0, core 1.6.0, server 1.2.0, sdk 1.5.0, authorization 1.0.8) |

## Next — small, high leverage

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004), [FK-GAP-017](FELTKIT_GAP_REGISTER.md#fk-gap-017) | FeltKit adopts AppPort sdk 1.5.0 / server 1.2.0 (the fixed subscription path) — prerequisite for scoped events in FeltKit | FeltKit | not started (0.3.16 pins sdk 1.4.0 / server 1.1.5) | partially addressed — AppPort half released (scoped events, subscription authorization); FeltKit integration not built (FeltKit 0.3.16 still on @appport/sdk 1.4.0). Multiplayer keeps its bounded presence records until then.; closed — released in AppPort (@appport/protocol 1.4.0, core 1.6.0, server 1.2.0, sdk 1.5.0, authorization 1.0.8) |
| [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004) | FeltKit integration of AppPort scoped events (publish from functions, client subscribe, scopes decided by the authorize hook) | FeltKit | unblocked (AppPort released); not started | partially addressed — AppPort half released (scoped events, subscription authorization); FeltKit integration not built (FeltKit 0.3.16 still on @appport/sdk 1.4.0). Multiplayer keeps its bounded presence records until then. |
| [FK-GAP-011](FELTKIT_GAP_REGISTER.md#fk-gap-011) | client reconnect on online/visibilitychange | FeltKit client | not started | open |
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | optional per-function `resource` declaration so a central policy does not infer resources from argument names | FeltKit | proposed (from consumer acceptance) | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |
| [FK-GAP-016](FELTKIT_GAP_REGISTER.md#fk-gap-016) | appport add --non-interactive | AppPort CLI | not started | open |

## Primitives that remove whole workarounds

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-013](FELTKIT_GAP_REGISTER.md#fk-gap-013) | accounts on AppBoundry (or via AuthBoundry) | AppBoundry | not started | open (blocks self-serve onboarding on the approved target) |
| [FK-GAP-008](FELTKIT_GAP_REGISTER.md#fk-gap-008) | app agent triggers (run as the agent principal on an event, with leases) | FeltKit + AppBoundry | not started | open (workaround in app) |
| [FK-GAP-002](FELTKIT_GAP_REGISTER.md#fk-gap-002), [FK-GAP-003](FELTKIT_GAP_REGISTER.md#fk-gap-003) | AuthBoundry resource evaluation + membership as delegation, consumed through feltkit({ authorize }) | AuthBoundry (+ FeltKit adapter) | FeltKit integration point exists | open — FeltKit integration point now exists (feltkit({ authorize })); AuthBoundry resource evaluation still missing; open — reassigned to AuthBoundry; FeltKit side now available (authorize hook) |
| [FK-GAP-007](FELTKIT_GAP_REGISTER.md#fk-gap-007) | Files authorized by resource + signed URLs | AppPort Services | not started | open (workaround in app) |

## Architecture and scale

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-009](FELTKIT_GAP_REGISTER.md#fk-gap-009) | managed AppBoundry target (routing/TLS, verified runtime, tokens) | AppBoundry | blocked (infrastructure) | blocking deployment acceptance |
| [FK-GAP-015](FELTKIT_GAP_REGISTER.md#fk-gap-015) | one AppBoundry artifact contract for every producer | AppBoundry + AppPort + FeltKit | not started | open |
| [FK-GAP-005](FELTKIT_GAP_REGISTER.md#fk-gap-005) | predicate-level live-query invalidation | FeltDB (change listener) + FeltKit | not started — reuse FeltDB readBasis (see register) | open |
| [FK-GAP-014](FELTKIT_GAP_REGISTER.md#fk-gap-014) | AppBoundry serves /appport and /mcp | AppBoundry | not started | open |
| [FK-GAP-006](FELTKIT_GAP_REGISTER.md#fk-gap-006) | text predicate / search index | FeltDB + FeltKit | not started | open (workaround in app) |
| [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | AppPort decision code for concealment | AppPort | not started | open (FeltKit workaround in the primitive) |

## Recorded, not planned

- **FK-GAP-012** Capabilities require hand-written output schemas even when the handler's return type is known — accepted (by design)
