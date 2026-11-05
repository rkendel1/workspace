# FeltKit platform roadmap, from the Multiplayer build

Evidence: [FELTKIT_GAP_REGISTER.md](FELTKIT_GAP_REGISTER.md) (16 gaps, source `feltkit-gaps.json`) and
[FELTKIT_MULTIPLAYER_BUILD_REPORT.md](FELTKIT_MULTIPLAYER_BUILD_REPORT.md). One application is one
data point. "Apps that benefit" is a judgement based on what kind of app hits the gap, not a survey.

Ranking criteria, in order:
1. custom code eliminated (measured here);
2. how many apps benefit;
3. developer effort saved;
4. security and correctness impact;
5. architectural importance;
6. implementation complexity (lower ranks earlier).

The smallest high-leverage changes come first. Each change is a reusable primitive or a composable
hook, not a Multiplayer feature.

## Tier 1: small changes, high leverage (do first)

| # | Change | Gaps | Owner | Eliminates here | Who benefits | Security | Complexity |
|---|---|---|---|---|---|---|---|
| 1 | **`feltkit({ authorize })`**: an application-supplied, input-aware AppPort `Authorizer`, composed after the role authorizer with `combineAuthorizers` and given a read-only `db`. It applies at HTTP, AppPort, MCP and Services, and denials are recorded with decision ids. Optional per-function `resource: (args) => ({ type, id })` | 001 (enables 002, 003, 007, 004-topics) | FeltKit | ~63 of 94 lines (43 call sites + plumbing); ~30 lines of policy relocate | Every multi-tenant app | **High.** Removes "forgot to call `requireChannel`" as a failure mode, and denials become evidence | **Low.** AppPort already provides `AuthorizationRequest.input`, `combineAuthorizers` and `authorizerFrom`; FeltKit's `Authority` already passes `input` |
| 2 | **`ctx.crypto.token(bytes)`**: a host-provided CSPRNG in both runtimes (FeltKit and the AppBoundry guest ABI) | 010 | FeltKit + AppBoundry | 0 lines; raises invitation codes from 48 to ≥128 bits | Any app with links, codes or API-like secrets | **Medium** | **Low** (one host op) |
| 3 | **Client reconnect on `online` / `visibilitychange`**: reset the backoff | 011 | FeltKit client | 0 lines; catch-up falls from 6–16 s to ~1 s | Every app using live queries | — | **Trivial** |
| 4 | **`appport add` non-interactive mode** (`--from contract.json` / flags), and document the Rust wasm32 requirement up front | 016 | AppPort CLI | — | CI, agents, scripted onboarding | — | **Low** |

## Tier 2: primitives that remove whole workarounds

| # | Change | Gaps | Owner | Eliminates here | Who benefits | Complexity |
|---|---|---|---|---|---|---|
| 5 | **Accounts on AppBoundry**: implement the identity interface so `auth.accounts` (sign-up, sign-in, reset) behaves the same on both runtimes, or delegate it to AuthBoundry. Until then, `feltkit build --target appboundry` should warn | 013 | AppBoundry (+ AuthBoundry) | ~10 lines of operator provisioning; **unblocks self-serve onboarding on the approved target** | Every user-facing app on AppBoundry | Medium |
| 6 | **App agent triggers**: `app.agent("assistant", { principal, roles, on: "<event>", handler })` executed by the runtime as the agent principal, with leases and at-least-once delivery, on FeltKit and AppBoundry | 008 | FeltKit + AppBoundry (FeltDB agent state) | ~110 of 133 lines (queue, claim and lease functions, worker, process); the agent's behaviour stays | Every "agents as participants" app, which is FeltKit's own thesis | Medium–high |
| 7 | **Ephemeral, authorized topics on `/api/events`**: `ctx.ephemeral.publish(topic, value, { ttl })` and `useEphemeral(topic)`, with topics authorized by #1 and never written to FeltDB | 004 | FeltKit (+ AppBoundry host for parity) | ~40 of 55 lines; also removes heartbeat commits from FeltDB and the activity log | Collaborative apps (presence, typing, cursors, live progress) | Medium |
| 8 | **Tenancy primitive**: `app.tenancy({ collection, roles })` with membership and invitation records and `ctx.tenant`, feeding #1 | 003 | FeltKit (or AuthBoundry) | ~110 of 147 lines (membership and invitation mechanics) | Every B2B / workspace app | Medium |
| 9 | **Files authorized by resource + signed URLs**: Files consults the app's authorizer (#1) on metadata, and functions issue short-lived upload/download URLs | 007 | AppPort Services + FeltKit route | ~30 of 78 lines (base64 transfer); removes the 1 MiB-through-JSON path | Any app with attachments | Medium |

## Tier 3: architecture and scale

| # | Change | Gaps | Owner | Why | Complexity |
|---|---|---|---|---|---|
| 10 | **Managed AppBoundry target**: routing/TLS (§18), a pinned verified runtime, scoped deploy tokens | 009 | AppBoundry | Without it, no FeltKit app reaches the approved target. **Blocks acceptance** | High (operations) |
| 11 | **One AppBoundry artifact contract** for every producer (FeltKit, `appport add` in any language), accepted by every runtime path (`run`, `install`, the Hetzner agent), with a producer-neutral deploy contract | 015 | AppBoundry + AppPort + FeltKit | Two formats, two runtimes and two manifests duplicate the control-plane surface | Medium–high |
| 12 | **Predicate-level live-query invalidation**: change events and query read sets carry indexed equality keys, so a client re-runs only when its channel changes | 005 | FeltKit (+ FeltDB F7 change listener) | Today one message re-runs every message, thread and unread query for every client. That's fine at demo scale and quadratic at team scale | Medium |
| 13 | **AppBoundry serves `/appport` and `/mcp`** from the manifest's AppPort contract | 014 | AppBoundry | MCP agents can't reach deployed apps; the HTTP function API works meanwhile | Medium |
| 14 | **AuthBoundry resource-level evaluation + a FeltKit adapter** through #1 | 002 | AuthBoundry, FeltKit | Moves tenancy and delegation to the authority boundary long term | High |
| 15 | **Text predicate / search index** in FeltDB, exposed as `ctx.db.query` `contains` / `app.collection(..., { search })` | 006 | FeltDB, FeltKit | Replaces O(workspace) scans | Medium |

Recorded and **not** proposed: FK-GAP-012 (capability output schemas are required). It's a deliberate
contract rule with a clear error message. At most, codegen could draft the schema.

## Sequencing

```text
#3, #2, #4 (days)  ─┐
#1 authorize hook ──┼─► #8 tenancy ─► #14 AuthBoundry adapter
                    ├─► #9 files by resource
                    └─► #7 ephemeral topics (authorized topics)
#5 accounts on AppBoundry ─┐
#10 managed target ────────┴─► first real FeltKit app on Hetzner
#6 agent triggers (independent; FeltKit's core agent story)
#11 one artifact contract (before more producers adopt either format)
#12, #13, #15 as scale and agent reach demand
```

## What closing tiers 1–2 would change in this app (estimate)

| | Now | After tiers 1–2 |
|---|---|---|
| Custom code attributable to gaps | ≈520 lines | ≈150 lines (policy and binding semantics that belong to the app) |
| Handlers that must remember an authorization call | 43 call sites | 0 (declared per function) |
| Processes to operate | app + agent worker | app |
| Durable writes for presence/typing | ≤ 1 per 2.5 s per typing user | 0 |
| Self-serve sign-up on the approved target | no | yes |
