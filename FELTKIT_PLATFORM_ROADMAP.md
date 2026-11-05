# FeltKit platform roadmap

> Generated from `feltkit-gaps.json` by `node tools/roadmap-md.mjs`. Edit the JSON, not this file.

Updated 2026-11-05. Evidence: [FELTKIT_GAP_REGISTER.md](FELTKIT_GAP_REGISTER.md) and [FELTKIT_MULTIPLAYER_BUILD_REPORT.md](FELTKIT_MULTIPLAYER_BUILD_REPORT.md).

Ranking criteria, in order: 1. custom code eliminated (measured); 2. apps that benefit; 3. effort saved; 4. security and correctness; 5. architectural importance; 6. implementation complexity (lower first).

Each change lives with the component that owns the concept (FeltKit composes; AppPort, AppPort Services, FeltDB, AuthBoundry and AppBoundry own their primitives).

## Done locally — awaiting review and release

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | feltkit({ authorize }) | FeltKit | implemented, tested (389/389), consumer acceptance passed; unreleased | implemented in FeltKit (local commit f20ed78, unreleased); consumer acceptance passed |
| [FK-GAP-017](FELTKIT_GAP_REGISTER.md#fk-gap-017), [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004) | AppPort: subscriptions and deliveries authorized by the application Authorizer; scoped events | AppPort | implemented, tested (1812 passed); unreleased; unblocks FeltKit ephemeral realtime | fixed in AppPort locally (f1f8c21, unreleased, unpushed); needs review and release; partially addressed — AppPort prerequisite implemented locally (f1f8c21, unreleased); FeltKit integration blocked on an AppPort release (publishing needs approval) |
| [FK-GAP-010](FELTKIT_GAP_REGISTER.md#fk-gap-010) | ctx.crypto.token + AppBoundry host interface crypto@1 | FeltKit + AppBoundry | implemented, tested, consumer acceptance passed; unreleased | implemented in FeltKit and AppBoundry (local commits, unreleased); consumer acceptance passed |

## Next — small, high leverage

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004) | FeltKit integration of AppPort scoped events (publish from functions, client subscribe, scopes decided by the authorize hook) | FeltKit | blocked on AppPort release | partially addressed — AppPort prerequisite implemented locally (f1f8c21, unreleased); FeltKit integration blocked on an AppPort release (publishing needs approval) |
| [FK-GAP-011](FELTKIT_GAP_REGISTER.md#fk-gap-011) | client reconnect on online/visibilitychange | FeltKit client | not started | open |
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | optional per-function `resource` declaration so a central policy does not infer resources from argument names | FeltKit | proposed (from consumer acceptance) | implemented in FeltKit (local commit f20ed78, unreleased); consumer acceptance passed |
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
