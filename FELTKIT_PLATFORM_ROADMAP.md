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
| [FK-GAP-019](FELTKIT_GAP_REGISTER.md#fk-gap-019), [FK-GAP-020](FELTKIT_GAP_REGISTER.md#fk-gap-020), [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | AppPort: core portability, per-connection subscriptions, NOT_FOUND decisions | AppPort | local branch claude/remaining-primitives; release first (unblocks FeltKit's AppPort 1.5 adoption) | fixed in AppPort (66a7874, local) with a portability test over core's import graph; needs core 1.6.1; fixed in AppPort (ada9157, local); needs a server release; implemented (AppPort 81ba58f + FeltKit 3abc1bd, local); awaiting review/release |
| [FK-GAP-021](FELTKIT_GAP_REGISTER.md#fk-gap-021) | Resolver on AppPort 1.5 | Resolver | local branch claude/appport-1.5 | fixed in rkendel1/resolver (c61fe14, local; tests 173 passed/9 skipped, unchanged); needs a release |
| [FK-GAP-011](FELTKIT_GAP_REGISTER.md#fk-gap-011), [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | FeltKit: reconnect on online/visible; NOT_FOUND decisions | FeltKit | local branch claude/remaining-primitives (mergeable now) | implemented (FeltKit 40ba4ad, local); awaiting review/release; Multiplayer e2e catch-up to be re-measured on release; implemented (AppPort 81ba58f + FeltKit 3abc1bd, local); awaiting review/release |
| [FK-GAP-004](FELTKIT_GAP_REGISTER.md#fk-gap-004) | Ephemeral scoped events (FeltKit app.event + AppBoundry events@1 + AppPort) | FeltKit + AppBoundry + AppPort | local branches; FeltKit's needs the AppPort release | implemented across AppPort, FeltKit and AppBoundry (local branches); Multiplayer adoption blocked on the AppPort release |
| [FK-GAP-016](FELTKIT_GAP_REGISTER.md#fk-gap-016) | appport add --help and no-terminal refusal | AppPort CLI (in rkendel1/appboundry) | local branch claude/remaining-primitives | closed in code (AppBoundry 5b1e311, local): the gap was smaller than recorded |

## Next — small, high leverage

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-001](FELTKIT_GAP_REGISTER.md#fk-gap-001) | optional per-function `resource` declaration so a central policy does not infer resources from argument names | FeltKit | proposed (from consumer acceptance) | closed — released in @feltdb/feltkit 0.3.16; adopted by Multiplayer (workaround removed) |

## Primitives that remove whole workarounds

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-013](FELTKIT_GAP_REGISTER.md#fk-gap-013) | accounts on AppBoundry (or via AuthBoundry) | AppBoundry | not started | open (blocks self-serve onboarding on the approved target) |
| [FK-GAP-008](FELTKIT_GAP_REGISTER.md#fk-gap-008) | app agent triggers (run as the agent principal on an event, with leases) | FeltKit + AppBoundry | not started | open (workaround in app) |
| [FK-GAP-002](FELTKIT_GAP_REGISTER.md#fk-gap-002), [FK-GAP-003](FELTKIT_GAP_REGISTER.md#fk-gap-003) | AuthBoundry resource evaluation + membership as delegation, consumed through feltkit({ authorize }) | AuthBoundry (+ FeltKit adapter) | FeltKit integration point exists | open — FeltKit integration point now exists (feltkit({ authorize })); AuthBoundry resource evaluation still missing; open — reassigned to AuthBoundry; FeltKit side now available (authorize hook) |
| [FK-GAP-007](FELTKIT_GAP_REGISTER.md#fk-gap-007) | Files authorized by resource + signed URLs | AppPort Services | not started | implemented in FeltKit (branch claude/file-links, local, not pushed); Multiplayer adoption awaits release |

## Architecture and scale

| Gaps | Change | Owner | State | Gap status |
|---|---|---|---|---|
| [FK-GAP-009](FELTKIT_GAP_REGISTER.md#fk-gap-009) | managed AppBoundry target (routing/TLS, verified runtime, tokens) | AppBoundry | blocked (infrastructure) | blocking deployment acceptance |
| [FK-GAP-015](FELTKIT_GAP_REGISTER.md#fk-gap-015) | one AppBoundry artifact contract for every producer | AppBoundry + AppPort + FeltKit | not started | open |
| [FK-GAP-005](FELTKIT_GAP_REGISTER.md#fk-gap-005) | predicate-level live-query invalidation | FeltDB (change listener) + FeltKit | not started — reuse FeltDB readBasis (see register) | open |
| [FK-GAP-014](FELTKIT_GAP_REGISTER.md#fk-gap-014) | AppBoundry serves /appport and /mcp | AppBoundry | not started | open |
| [FK-GAP-006](FELTKIT_GAP_REGISTER.md#fk-gap-006) | text predicate / search index | FeltDB + FeltKit | not started | open (workaround in app) |
| [FK-GAP-018](FELTKIT_GAP_REGISTER.md#fk-gap-018) | AppPort decision code for concealment | AppPort | not started | implemented (AppPort 81ba58f + FeltKit 3abc1bd, local); awaiting review/release |

## Recorded, not planned

- **FK-GAP-012** Capabilities require hand-written output schemas even when the handler's return type is known — accepted (by design)
