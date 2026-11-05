# Identity and tenancy as part of the application–host contract (FK-GAP-013)

Status: **proposed decision**, for approval before any further implementation. Date 2026-11-05.

The question: how does an authenticated, multi-tenant FeltKit application run unchanged on AppBoundry, with
one identity system rather than two, and without the developer knowing how AppBoundry handles identity?

Evidence cited:
- FeltKit `main` (38a62e3, plus branches `claude/tenancy-followups`, `claude/gap-008`, `claude/appboundry-gaps`).
- AppBoundry `claude/gaps-013-014-015` (`packages/appboundry-host/src/{identity,manifest,managed}.ts`, `docs/identity-host-interface.md`).
- AppPort's published packages.

## Decision in one paragraph

- **One identity system, FeltKit's.** FeltKit owns accounts, sessions' meaning, challenges, workspaces, memberships and invitations: their records, flows and rules, in the application's own FeltDB state.
- **What AppBoundry owns.** It owns the execution boundary: it terminates HTTP, holds the secrets, stores and checks session tokens through **AppPort's `SessionStore` contract** (which FeltKit's sessions already implement), performs side effects such as mail, and hands the artifact a **trusted principal with its tenant** on every call.
- **The contract.** The artifact **declares** the identity capabilities it requires, as host interfaces (`accounts@1`, `tenancy@1`). AppBoundry **verifies at install** that it can satisfy them, and refuses otherwise.
- **Authorization stays the application's.** The same roles, `access`, `authorize` hook and tenant-scoped collections apply, for people and agents alike, in the guest.
- **No environment flag.** The `--accounts operator-sessions` escape hatch is a transitional measure, removed when `accounts@1` ships.

## 1. What FeltKit implements today

All of the following is implemented and tested on FeltKit's Node server (`feltkit dev`, `feltkit start`); details are in `docs/AUTH.md`.

| Area | Implementation | State (FeltDB, app instance) |
|---|---|---|
| Accounts | Password (scrypt), magic link and code, Google, GitHub and OIDC (PKCE). Profile, address change, password change, provider unlink, disable. | `_feltkit_accounts`, `_feltkit_account_emails` |
| Challenges | Verify, reset, magic link, address change. Digest-only, at most 15 minutes, single use, superseded, attempt- and issue-limited. Tokens are `HMAC(auth secret, nonce)` at delivery. | `_feltkit_challenges` |
| Sessions | AppPort `SessionStore` (conformance-tested). `fks_` tokens, SHA-256 stored. HttpOnly cookie and CSRF token for browsers; bearer for others. Re-resolved per request. | `_feltkit_sessions` |
| Tenancy | Tenants, memberships (ranked roles from `roles`, typed claims), invitations, switching (rotates the session), agent and service members. | `_feltkit_tenants`, `_feltkit_memberships`, `_feltkit_invitations` |
| Data scope | `{ tenant }` collections: every read and write is scoped to `principal.tenant`. **Already enforced in the AppBoundry guest.** | app collections |
| Mail | AppPort Services notification → Mailerport (`MAILPORT_URL`), rendered at delivery. | `notifications` |
| Agents | `app.agent` triggered after commit and run as the agent principal (FK-GAP-008, Node only). | `_feltkit_outbox` |

On AppBoundry today:
- the guest enforces `access`, `authorize` and tenant scope;
- the host's identity is separate: operator-provisioned users and sessions (`_appboundry_users`, `_appboundry_sessions`, `abs_`/`abo_` bearer tokens), and principals of `{ id, type, roles }` with **no tenant**;
- none of the `/api/auth/*` and `/api/tenants/*` routes exist there.

That is the gap.

## 2. What AppBoundry must provide

Two host interfaces, declared by the artifact and checked at install.

**`accounts@1`**
1. **Routes.** Forward `/api/auth/*` and `/api/account/*` to a guest **identity invocation** `{ http: { method, route, body, query, session } }`. The forwarding uses a header allow-list, a body limit and the host's rate counters. The guest answers `{ status, body, effects }`.
2. **Session transport.** The same contract as FeltKit's Node server:
   - `__Host-` HttpOnly cookie, SameSite=Lax;
   - a session-bound CSRF token and an Origin check on unsafe requests;
   - bearer tokens for non-browser clients.

   This contract is written once, in AppPort's HTTP binding (§9, decision D2), so the FeltKit client behaves identically on both runtimes.
3. **Session storage.** An AppPort `SessionStore` over the artifact's own state, keeping the token digest only. On a sign-in **effect** (`session.issue { principal, tenantId? }`) the host issues the token; the guest never sees raw session secrets except at issue time.
4. **Secrets.**
   - `crypto@1` gains `sign`/`verify` with a host-held identity secret (the role of `FELTKIT_AUTH_SECRET`), plus `hash`/`verifyHash` (scrypt).
   - Challenge tokens, invitation tokens and CSRF tokens derive from it.
   - The secret never enters the guest.
5. **Mail.** The guest's challenge and invitation e-mails are after-commit outbox effects (`transactions@1`). The host delivers them through the operator's mail transport (Mailerport). Without a transport, a production host refuses an artifact that declares `accounts.email`.
6. **Provider sign-in** (OAuth/OIDC) is a host-performed outbound effect to an **operator allow-list** of issuers (decision D3). The client secret is held by the host as a credential.

**`tenancy@1`**
1. **Routes.** Forward `/api/tenants/*` and `/api/invitations/*` to the same identity invocation.
2. **Resolution on every call.** The host asks the guest `resolve { sessionPrincipal, tenantId }` and gets back the principal **as it is now**: account roles plus the live membership's role and claims. It caches the answer per commit sequence, and invalidates it when identity collections change (the change feed names them; see FK-GAP-005).
3. **Passing the tenant.** The host passes `principal.tenant` into every function, AppPort and MCP invocation. The guest already scopes tenant collections to it.

**Not required of AppBoundry:**
- no account records of its own for these artifacts;
- no knowledge of passwords, flows or roles semantics;
- no AuthBoundry dependency.

`_appboundry_users` and operators remain for artifacts without accounts, and for operating the host.

## 3. How trusted identity reaches the artifact

```
browser ──cookie/bearer──▶ AppBoundry host
                             │ 1. SessionStore.get(digest)        (host; token never leaves)
                             │ 2. resolve(principal, tenantId)    (guest identity code, cached per commit)
                             │      → { id, type, roles: account ∪ membership role, tenant: { id, role, claims } }
                             ▼
                          guest invocation { principal, args }    (functions, /appport, /mcp, agents)
                             │ roles → access → validate → authorize(hook) → tenant-scoped ctx.db
```

What the guest can and can't trust:
- **The guest trusts only the invocation's principal.** That principal is assembled by the host from a token the host verified, and from the guest's own resolution against current state.
- **Nothing in a request can supply a tenant, roles or claims.** This is FeltKit's existing rule. The contract moves "who checks the token" to the host, and keeps "what the token means" in FeltKit.

## 4. Permissions across human and agent execution

One path for every principal:
- **Steps:** roles (from `roles`) → `access` → argument validation → the app's `authorize` hook → tenant-scoped data. These run in the guest, on both runtimes.
- **People:** account roles, plus their membership role while working in a tenant.
- **Agents and services:**
  - Operator-issued identities (`type: "agent" | "service"`), with their declared roles.
  - They are members of a tenant only if a manager added them (`members/add`).
  - **Triggered agents** (`app.agent`, FK-GAP-008) run with the agent's own roles, **never the triggering user's**, in a tenant only where the agent is a member.
- **What AppBoundry needs for agents:** a third interface, `agents@1`. The host claims outbox records of `service: "agent"` and invokes the guest's agent handler as the agent principal, with the same lease and retry semantics as FeltKit's Node worker. Until then, the build refuses `app.agent` for AppBoundry (fail closed, implemented).
- **Delegation** ("this agent acts for this person, within that person's authority") is **not** part of this contract. It is the agent workstream's next decision: AuthBoundry's delegation contract implemented in FeltKit (`FELTKIT_AUTH_AGENT_STACK_AUDIT.md` §5.3), carried on the principal as `{ actor, onBehalfOf, delegationId }` in AppPort.

## 5. Managed FeltDB

- **Identity state is application state.** FeltKit's identity collections are part of the artifact's FeltDB state contract (`runtime/contract.ts` already lists them), so:
  - they live wherever the application's state lives: local state, or a Managed FeltDB environment;
  - they are backed up and restored with the data;
  - they move with the application between runtimes.
- **The same records are read by both runtimes.** A FeltKit app run on Node with remote FeltDB and the same artifact on AppBoundry managed read the same accounts, sessions and memberships. **No identity migration is needed to move between runtimes.**
- **Single writer.** AppBoundry's managed mode keeps one runtime per environment under a lease (`managed.ts`), and identity writes go through it like any other commit. A second runtime (scale-out) needs the resolution cache keyed by commit sequence (§2), which the change feed already supplies.
- **Secrets are not state.** The identity secret is held by the host per environment, the same way `FELTKIT_AUTH_SECRET` is an environment variable today. Rotating it ends outstanding challenges, invitation links and CSRF tokens, not sessions.

## 6. Migration without breaking anyone

| Who | Today | After `accounts@1` / `tenancy@1` ship |
|---|---|---|
| Artifacts without accounts or tenancy | Operator users and sessions | Unchanged |
| FeltKit apps with accounts on the Node server | Work | Unchanged; the same code path (see DX) |
| Accounts artifacts on hosts released before d11fd9b | Run silently on operator sessions (FeltKit warns at build) | Rebuild: the artifact now *requires* the interfaces, so old hosts refuse it at install with a precise message |
| Accounts artifacts on hosts with d11fd9b | Refused unless `--accounts operator-sessions` | The flag is deprecated, then removed. Rebuilt artifacts install normally. |
| Data | — | None to migrate: identity records already use FeltKit's schema in the app's state. Apps that lived on AppBoundry with operator users keep those users for operation; people sign up as accounts. |

Rule: **a host either satisfies an artifact's declared requirements or refuses it at install**, naming the interface and the host version that provides it. Nothing ever works in development and then fails at runtime after deployment.

## 7. Developer experience

The developer writes only this, the same as today:

```ts
feltkit({ roles, auth: { accounts: { roles: ["person"], magicLink: true, email: { from } }, tenant: { roles: [...] } } })
app.collection("policies", { … }, { tenant: true })
```

```bash
npx feltkit dev      # Node server: identical identity code path
npx feltkit deploy   # builds the artifact (declaring accounts@1, tenancy@1), installs it on AppBoundry
```

The developer never handles any of the following:
- AppBoundry's sessions, secrets or cookies;
- forwarding;
- an environment flag.

What makes "works in development, works deployed" true by construction:
1. **One implementation.** FeltKit refactors its account and tenancy routes (`server/index.ts` auth block, `server/tenancy.ts`) into a **transport-neutral identity handler**: request in, `{ status, body, effects }` out. The Node server calls it, and the AppBoundry guest is compiled with it. There is no second copy.
2. **One conformance suite.** The identity tests (sessions, CSRF, challenges, tenancy, invitations, the browser journey in `tests/e2e/auth-ui.test.mjs`) run against **both** runtimes. A host that passes it may advertise `accounts@1` and `tenancy@1`.
3. **Failures surface at deploy.** `feltkit deploy` checks the target host's advertised interfaces before uploading, and stops with "this host provides accounts@1 from version X; yours is Y".

## 8. FK-GAP-015: one canonical artifact contract (cross-project decision)

The recognizer and verifier (AppBoundry 8636580) is the **interim** step. The decision to take with AppPort, FeltKit and AppBoundry is one artifact contract, owned by **AppPort** (the producer-neutral contract layer), covering the six elements you named:

| Element | FeltKit artifact today | `appport add` bundle today | Proposed owner and shape |
|---|---|---|---|
| Identity | `application.id` in `manifest.json` | bundle manifest name | AppPort: `{ id, version, producer }` |
| Manifest and metadata | `appboundry.app/1` | repository bundle manifest | AppPort: one schema, versioned |
| Capabilities | the AppPort contract inside the manifest | the AppPort contract | AppPort: already shared, keep it |
| Required runtime interfaces | `runtime.interfaces` (migrations, transactions, crypto, events, + accounts/tenancy/agents) | the WASM ABI | AppPort: one interface registry with versions; hosts advertise, artifacts require |
| Integrity and provenance | sha256 of `module.wasm` in the manifest | bundle digest | AppPort: digest of every file plus producer and source revision, signable |
| Compatibility | host refuses unknown interfaces | `appport app start` ABI check | AppPort: semver per interface, checked at install |

Recommendation:
- **Bring forward the interface registry.** It is the piece that FK-GAP-013 (`accounts@1`, `tenancy@1`), FK-GAP-008 (`agents@1`) and FK-GAP-015 all need.
- **Converge the two formats** behind it in a later phase.

## 9. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| D1 | Identity records live in FeltKit's collections in the artifact's state, not in host-owned collections | **Yes**: one schema, portable between runtimes, no second system |
| D2 | Where the browser session contract (cookie, CSRF, Origin) is specified | **AppPort's HTTP binding**, implemented by both FeltKit's server and AppBoundry's host |
| D3 | Provider sign-in on AppBoundry | Host-performed outbound effect with an operator allow-list, in `accounts@1` v1 (or defer providers to v2) |
| D4 | Who owns the interface registry and the canonical artifact contract | **AppPort** |
| D5 | Order of work | (a) the FeltKit transport-neutral identity handler (benefits Node too); (b) AppPort's interface registry and principal tenant field; (c) AppBoundry `accounts@1`/`tenancy@1`, run against the shared conformance suite; (d) `agents@1`; (e) the canonical artifact contract |

## 10. The insurance application

It is the right first customer-facing application. It exercises every capability above with real contention:
- several staff on one customer;
- an AI agent starting work that an owner reviews;
- records changing while people work on them.

**Prerequisites before starting it:**
- D1–D5 decided;
- at least (a)–(c) of D5 done, so that it deploys to AppBoundry with accounts and agency workspaces on the same terms as development;
- (d), if its calling workflows must run on AppBoundry rather than FeltKit's Node server.

**What it will test that toy applications cannot:**
- **Concurrent edits** to one customer record: FeltDB's fenced reads already refuse stale commits. The open question is the UX for conflicts.
- **Agent proposals reviewed by an owner:** FeltKit's proposal and approval lifecycle, plus `app.agent` triggers.
- **Phone integrations:** AppPort integrations, with the provider configured through Resolver.
- **Agent acting for a staff member:** delegation, the next agent-workstream decision.
