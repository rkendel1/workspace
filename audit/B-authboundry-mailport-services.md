# Capability audit: AuthBoundry, MailPort, AppPort Services, felt-ops

Audit date 2026-11-05. Read-only. Nothing in the repositories was changed. Cargo builds used a separate `CARGO_TARGET_DIR`, and `git status` was clean afterwards.

Status scale: 1 = implemented and tested, 2 = implemented but incomplete, 3 = contract or schema only, 4 = planned or documented only, 5 = missing.

Evidence tags:
- **[V]** I verified it in source.
- **[R]** I verified it by running the test in this audit.
- **[I]** Inference.

Tests I ran, all passing:
- `cargo test -p appport-auth-mesh-dsl -p appport-auth-mesh-authz -p appport-auth-mesh-runtime -p appport-auth-mesh-providers`. The DSL has 17 unit tests. Authz has evaluator unit tests plus `tests/principal_delegation.rs` and `tests/snapshot.rs`. Providers has 20 tests. Runtime has 17 tests in `tests/end_to_end_auth.rs`.
- MailPort: `node --test test/mailport.test.js test/remote-service.test.js test/dsl.test.js test/operations.test.js`, 13 of 13 passed.

I found the other tests cited below but did not run them.

---

## 1. AuthBoundry (`/home/user/authboundry`)

### Layout [V]

There are 15 Rust crates in a Cargo workspace. Each library crate's dependency on the next is noted below.
- `dsl` (only depends on serde)
- `contract` (dsl, serde)
- `authz` (contract, dsl, storage, serde)
- `storage` (contract, serde, serde_json; includes an in-memory implementation)
- `providers` (dsl, argon2, rand, **reqwest blocking**)
- `runtime` (all of the above, plus surface and semantic)
- `boundary` (runtime plus services and surface)
- `server`, `cli`, `feltdb-adapter`, `discovery`, `authority-bridge`, `services`, `surface`, `semantic`

npm packaging:
- The root `package.json` is `@authboundry/core@1.16.0` (`"license": "UNLICENSED"`). Its `dist/{index,client,server,react,appport}.js` files are **HTTP clients of a running AuthBoundry**. It also ships native CLI binaries, `@authboundry/core-<platform>`.
- `packages/authboundry@2.16.0` is a redirect to that package.
- `clients/js/authboundry.js` is a browser client, a 188-line fetch wrapper.
- Nothing builds **WASM or N-API**: grep found no `wasm` in any `Cargo.toml` or `package.json`. No Cargo crate has publish metadata, so none is on crates.io [I].

### Capability table

| Capability | Status | Evidence (paths, tests) | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| `use auth` DSL parser | **1** [R] | `crates/dsl/src/parser.rs` (1517 lines, hand-written recursive descent), `crates/dsl/src/model.rs` (`AuthConfig`). There are 17 tests in `parser.rs` `mod tests`, for example `parses_mvp_auth_block`, `parses_resource_aware_policy_block`, `agents_and_ui_participate_in_the_fingerprint`, `rejects_duplicate_claims_and_unknown_fields`, `mailport_contract_uses_the_existing_mail_dsl_shape` and `parses_flow_invariant_declarations_and_versions_them`. | `parse_flow(&str)`, `parse_auth_block(&str) -> Result<AuthConfig, AuthDslError>`, `AuthConfig::{validate, canonical, fingerprint}` | serde only | This is a pure Rust library crate, `appport-auth-mesh-dsl`, not embedded in the server. It cannot be used from JS (see the reuse section). |
| DSL grammar | 1 [V] | `parser.rs:84-104` (auth fields), 260-351 (`use control_plane`, `appport { services }`), 355-383 (`use mail` / `mail {}`), invariants at about line 120 | n/a | n/a | See the grammar below. |
| DSL compile target | 1 [V/R] | `AuthConfig` struct; `runtime/src/mesh.rs:2001 policy_from_config` turns `policy {}` into `authz::Policy` rules (`TenantCurrent`, `ClaimEquals`/`ClaimIn`, `ResourceSelector`, `Action`); `fingerprint()` gives a canonical hash. Claims go to `runtime/src/claims.rs::resolve_claims`. | n/a | n/a | It compiles to an in-memory Rust struct plus a deterministic fingerprint. It does not generate code. |
| Principal model (human, agent, service) | 1 [R] | `contract/src/principal.rs`: `enum PrincipalKind { Human, Agent, Service }`; `struct Principal { id, kind, tenant_id, claims, version, agent_state: Option<AgentState> }`; `enum AgentState { Created, Active, Suspended, Revoked, Retired }`; `struct Agent { id, principal_id, tenant_id, name, status, created_by, created_at }`; `AgentCredential` (`secret_hash`, `revoked_at`). Tests: `runtime/tests/end_to_end_auth.rs::agents_are_only_available_when_declared`, `a_revoked_agent_loses_authority_independently_of_its_delegator` | `Principal::{human, agent, service}` | contract | An agent is a principal of kind `Agent` with a lifecycle state. An inactive agent gets an empty envelope (`authz/src/evaluator.rs:58-60`). A principal belongs to exactly one tenant. |
| Delegation data model | 1 [R] | `contract/src/delegation.rs`: `Delegation { id, delegator, delegate, tenant_id, capabilities: Vec<Capability>, resource_scope: ResourceScope{type,id,attributes}, issued_at, expires_at: Option, revoked_at: Option, chain: Vec<DelegationId> }`, `status_at()` → `Active/Pending/Expired/Revoked` | `AuthMesh::{delegate, revoke_delegation, delegations_for, live_delegations}` | contract, storage | Expiry and revocation are both in the model. |
| Delegation enforcement | 1 [R] | `authz/src/evaluator.rs:38 evaluate_with_delegations` (only live delegations for the same tenant and delegate are counted; each grant records `delegation_id`, `delegation_chain` and `delegated_by`); `delegation_scope_matches` at line 440. Tests: `authz/tests/principal_delegation.rs::{humans_agents_delegation_and_tenant_boundaries_work_end_to_end, adversarial_authorization_cases_fail_closed, humans_can_exercise_delegated_authority}`; `end_to_end_auth.rs::{revoking_a_delegation_removes_agent_authority, an_expired_delegation_stops_granting_authority, delegated_authority_is_limited_by_resource_scope, a_delegation_belongs_to_one_tenant}` | `authz::evaluate_with_delegations`, `evaluate_authorization_request` | n/a | n/a |
| Attenuation (a delegate cannot exceed its delegator) | 1 [R] | `runtime/src/mesh.rs:724-850 delegate()`. The delegator's own envelope must allow each capability, otherwise it fails with `DelegationExceedsAuthority`. An agent delegator's `resource_scope` must satisfy `is_subset_of(parent)`. Human delegates are refused. Tests: `end_to_end_auth.rs::delegation_cannot_exceed_the_delegators_own_authority`, `chained_delegation_preserves_attenuated_scope_and_evidence`, `agent_runs_are_ephemeral_attenuations_of_delegation_authority`, `child_runs_cannot_widen_parent_run_authority`; server `tests/effective_authority_nonescalation.rs` | n/a | n/a | Attenuation is checked **when the delegation is created**. The evaluator does not re-check the delegator's current authority at decision time [V: evaluator.rs:82-98]. If the delegator is later demoted, the delegation stays live until it is revoked or expires [I]. |
| Delegation chain | 1 [R] | `chain` is carried from the parent delegation (`mesh.rs:808-811`). Test: `chained_delegation_preserves_attenuated_scope_and_evidence` | n/a | n/a | Only agent-to-agent re-delegation builds a chain. |
| Agent runs (task-scoped, ephemeral sub-authority) | 1 [R] | `mesh.rs:196 RunCreationRequest { task_id, task_purpose, delegation_id, parent_run_id, capabilities, resource_scope, expires_at, constraints }`; `create_agent_run` at line 973 rejects a run that outlives its delegation or widens its scope | `create_agent_run`, `cancel_agent_run`, `authorize_run_request_with_authority_revision` | n/a | This is a strong fit for FeltKit agent tasks. |
| Agent credentials (`aga_…`, non-interactive) | 1 (tests found, not run) | `storage/src/agent_credential.rs` (`AgentCredentialRecord` with family, scopes that only narrow, TTL, family expiry, rotation, replay revoking the family); `server/src/agent_credentials.rs`; tests `server/tests/agent_credentials.rs::{credentials_expire_and_renewal_never_outlives_the_family, renewal_rotates_and_a_replayed_credential_revokes_the_family, revocation_takes_effect_on_the_next_request, lifecycle_is_audited_without_secret_material}` | HTTP `POST …/applications/:id/agent-credentials`, `/_authboundry/agent-credentials/renew` | server, feltdb-adapter | This logic lives in the **server crate**, not in a library. |
| Tenancy: tenant, isolation | 1 [R] | `contract/src/tenant.rs` (`Tenant {id, namespace, policy_id, storage_root_id}`); the evaluator fails closed when tenants do not match. Tests: `end_to_end_auth.rs::tenant_isolation_holds_for_humans_and_for_agents`, `authz` `fails_closed_when_principal_tenant_does_not_match_context` | `AuthMesh::tenant` | n/a | One policy per tenant. |
| Memberships (one user in many tenants) | 5 [V] | A `Principal` has a single `tenant_id`. grep finds no `membership` type in any crate. | n/a | n/a | A user in N tenants means N principals [I]. |
| Invitations | 5 [V] | `invit*` appears only in `discovery/src/web/inference.rs` (heuristics) | n/a | n/a | n/a |
| Tenant switching | 4 [V] | It appears only as the flag `AuthExperience.tenant_switching` (`dsl/src/model.rs:621`). No runtime code exists. `authboundry.flow` sets it to `false`. | n/a | n/a | n/a |
| Organizations (control plane) | 2 [V] | `storage/src/control_plane.rs::OrganizationRecord`, `ApplicationRecord`, `ControlPlaneRepository`; JS `companies.create/list/inspect` in `dist/server.js` | HTTP `/_authboundry/control-plane/organizations` | server, FeltDB | These are AuthBoundry's own customer and org records, not app tenants with members. |
| Typed claims | 1 [R] | `dsl` `ClaimKind { Enum(Vec), String, Integer, Boolean }`; `contract/src/claims.rs::ClaimValue`; `runtime/src/claims.rs::resolve_claims` (a missing declared claim is denied, an undeclared claim is denied, enum values are validated). Test: `end_to_end_auth.rs::every_unresolved_input_is_denied`, `declaration_flows_all_the_way_to_a_runtime_context` | `resolve_claims`, `parse_claim_value` | n/a | Roles are expressed as an enum claim (`role = enum[...]`). There is no separate role type. |
| Policy evaluation, capability-level | 1 [R] | `authz/src/evaluator.rs::{evaluate, evaluate_with_delegations, evaluate_capability}`; tests `grants_capability_when_claim_matches` | n/a | n/a | n/a |
| Policy evaluation, resource-level (library) | 1 at the library level [R] | `authz/src/evaluator.rs:226 evaluate_authorization_request` matches `ResourceSelector`, resource tenant, `Condition`s on resource attributes, and delegation `ResourceScope`. Test: `authz` `resource_requests_enforce_tenant_claims_and_relationships`; `boundary/tests/authority.rs::route_authorization_uses_resolved_resource_tenant` | `AuthMesh::authorize_request*` | n/a | The engine supports it. |
| Resource-level evaluation over the HTTP and `enforce()` application path | **2** [V] | `server/src/control_routes.rs:1665 authorize_application_capability_for` calls `mesh.authorize_from_snapshot` (capability plus delegations) and copies `resource` into the request context and evidence only. `docs/ENFORCEMENT.md:409` says "Resource-level evaluation. `resource` is recorded as evidence." This is **confirmed**. | n/a | n/a | So the docs are correct for the application `enforce()` path but understate the library. |
| JS `enforce()` SDK | 1 (tests found, not run) | `dist/server.js:487-…` `createAuthBoundryEnforcer`, `EnforcementOutcome {AUTHORIZED, DENIED, AUTHORITY_UNAVAILABLE, AUTHORIZATION_TIMEOUT, INVALID_REQUEST}`, 5 s default timeout, max 60 s, no decision cache, server-only. It requires an `abc_` check credential and optionally sends an `aga_` agent credential header. Tests: `test/enforcement-sdk.test.js` (`ALLOW executes exactly once…`, `DENY never executes`, `TIMEOUT never executes, even if an allow arrives late`, `an allow that answers a different question never executes`, and others); `crates/server/tests/enforcement_contract.rs` | `createAuthBoundry`, `createAuthBoundryEnforcer`, `enforce/check/authorize/effect` | **A running AuthBoundry server, reached over HTTP** | It is a policy enforcement point (PEP) only. Every decision is a network round trip to the authority. |
| Provider: local password | 1 [R] | `providers/src/connectors/local.rs` (argon2); tests `local_connector_proves_external_identity`, `local_connector_fails_closed` | `AuthConnector` trait | argon2 | n/a |
| Provider: Google | 2 [V] | `connectors/google.rs` uses an OAuth2 code flow and then the `userinfo` endpoint, through blocking reqwest. It has **no PKCE, no nonce and no id_token verification**. Test: `google_connector_is_configured_from_environment` (configuration only). | n/a | reqwest | There is no live exchange test. |
| Provider: GitHub | 1 (tests found, partly run) | `connectors/github.rs` (562 lines); unit tests `state_is_one_time_use`, `authenticate_validates_tenant_binding`; server `tests/github_oauth_live.rs`, `github_identity_session_durability.rs` | n/a | reqwest | n/a |
| Provider: email one-time code | **2** [V/R] | `connectors/email.rs`: a 32-byte hex code, state in an in-memory `Mutex<BTreeMap>`, single use. Test: `email_connector_delivers_and_consumes_a_one_time_code`. **The code has no expiry and no attempt limit**, and `begin()` **discards the code**. `begin_with_code` has no caller outside `providers` (grep), so the server never sends the code through MailPort. | `EmailConnector::begin_with_code` | rand | This is a usable OTP primitive, but it is not wired end to end. |
| Provider: magic link, Microsoft, Apple, SSO, JWT, generic OIDC | 3 [V] | `catalog.rs` names them. `registry.rs:110` maps them to `DeclaredConnector`, which refuses every attempt (`connectors/declared.rs`). Test: `declared_connectors_fail_explicitly`. There is no generic OIDC connector. | n/a | n/a | n/a |
| Password reset and email verification ceremonies | 1 (tests found, not run) | `boundary/src/ceremony.rs` (opaque single-use token, `expires_at`, consumed or revoked) plus `trait MailPort`; `server/src/mailport.rs` (`DevelopmentMailPort` and `RemoteMailPort` → `POST /v1/messages` `{template, payload:{identity,to,tenantId,variables,idempotencyKey}}`). Tests: `boundary/tests/authority.rs::{password_recovery_is_opaque_single_use_and_delivered_through_mailport, email_verification_uses_the_same_single_use_ceremony}`; `server/src/mailport.rs::request_matches_mailports_remote_template_contract` | n/a | MailPort over HTTP | Uses MailPort *template* sends. |
| Sessions | 1 (tests found) | `storage/src/session_store.rs::Session {id, identity_id, tenant_id, created_at, expires_at, revoked_at}`. The credential is the opaque, server-side `apt_<tenant>.<sess_id>` (`boundary/src/request.rs:174`). TTL is `DEFAULT_SESSION_TTL_SECONDS = 3600` (`runtime/src/mesh.rs:48`). `logout` revokes the session (`mesh.rs:624-640`). The FeltDB store mints ids with `OsRng` (`feltdb-adapter/src/session_store.rs:37`); the memory store uses a SipHash of a random seed, counter and time (`storage/src/memory.rs:152`). The cookie is `HttpOnly; SameSite=Lax` **with no `Secure` flag** (`server/src/http.rs:228`). Tests: `boundary/tests/authority.rs::a_session_credential_round_trips_and_rejects_nonsense`; server `github_identity_session_durability.rs`, `test/session-store-restart.test.js` | `AuthMesh::{sign_in, logout, resolve_session}` | n/a | No JWTs and no refresh tokens. Sessions are always looked up server-side. |
| Audit log | 1 (tests found) | `storage/src/audit_log.rs` (`trait AuditLog`, append-only, ordered by `next_audit_sequence`); `feltdb-adapter/src/audit_repository.rs`; the runtime records `DelegationCreated` and decisions (`mesh.rs:836`, `record_decision`). Audit failure denies (`server/tests/enforcement_contract.rs`, per ENFORCEMENT.md; not re-run). | `AuthMesh::audit_events`, `recent_decisions` | storage | n/a |
| Embedded mode (in-process) | 1 for Rust (tests found, not run) | `boundary/src/runtime.rs:55 BindingMode::{Embedded, Standalone}`; `boundary/tests/authority.rs::embedded_and_standalone_decide_identically` | `AuthPortRuntime` | Rust only | Embedding works **in a Rust host only**. |

### `use auth` grammar, as accepted [V]

- **Top-level blocks:** `use auth` (bare, which gives the `local` provider), or `use auth { … }` with at most one auth block.
- **Optional blocks:** `use control_plane { authoritative_state=[…], storage="…" }`, `appport { services=[webhooks|api_keys|secrets|jobs|configuration|notifications|files|schedules], classification }`, `use mail` + `mail { identities{…} templates{…} }`, `invariant "id" { description scope severity subjects enabled }`, and a reporting block.
- **Auth fields** (both `key = value` and `key: value` work; unknown or duplicate fields are errors):
  - `providers = [ids]`. This is a free list. Unknown ids resolve at runtime through the catalog, not in the parser.
  - `tenant` or `multi_tenant = bool`
  - `isolation = "strict" | "shared_storage_with_policy"`
  - `agents = bool`
  - `claims = { name = enum["a","b"] | string | integer | boolean }`
  - `policy { cap.action { tenant = current; resource = X; action = Y; <claim> = [values] } }`
  - `password { min_length … history_count … }`
  - `storage { authority audit reporting }`
  - `owned_state = [...]`
  - `experience { 16 capabilities = enabled|disabled|... }`
  - `ui { mode theme <screen> = default|custom }`
- **Policies support only allow-rules on claims, tenant-current and resource type.** The DSL has no syntax for relationships or ownership conditions, although the authz `Condition` enum has richer variants [I: inferred from `policy_from_config`].
- **Implementation:** about 1,000 lines of a small block/list/enum value parser. Some sections, such as `use mail`, `invariant` and `use control_plane`, are found by substring search over the whole source instead of being tokenized [V: lines 106-123 and 260 onward]. This makes the grammar somewhat ad hoc.

### Library versus hosted server (answers question 9)

| Piece | Pure library (no service) | Needs the hosted or running AuthBoundry server |
|---|---|---|
| DSL parser (`dsl`) | Yes, Rust | n/a |
| Contract types (`contract`) | Yes, Rust | n/a |
| Evaluator (`authz`) | Yes, Rust, pure functions | n/a |
| Runtime mesh (`runtime` + `storage` memory stores) | Yes, Rust. It needs `providers`, which pulls in blocking reqwest. | n/a |
| Boundary embedded (`boundary`) | Yes, Rust | n/a |
| Agent credentials, check credentials, control plane, application contracts | No | `server` crate plus FeltDB |
| `@authboundry/core` JS (`createAuthBoundry`, `enforce`, `companies`, `principals`, `policies`) | No | **Every call is an HTTP request to `authorityUrl`** |
| `clients/js` browser client | No | `/auth/session`, `/auth/sign-in` on a server |
| CLI / native binaries | A local process (the authboundry binary), not a library | It runs the server locally |

---

## 2. MailPort (`/home/user/rkendel1/mailport`)

The workspace contains `mailerport@0.1.0` (meta package depending on `@mailerport/core`, `@mailerport/sdk`) and these packages, all at 0.1.0: `@mailerport/{core, sdk, mime, smtp, service, testing}`. Packed `.tgz` files are in the repo root. The source of truth is `src/*.js`; `packages/*/src` hold copies of it.

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| Send, template or explicit | 1 [R] | `src/mailport.js:95 createMailPort`, `send(templateOrPayload, payload)`. Test: `test/mailport.test.js` "supports template send and idempotency", "supports explicit send, list/get/clear, and waitFor" | `createMailPort({transport, templates, identities, remote})` → `{send, get, list, status, test.*}` | none | Transports: memory, local, smtp, direct-MX, cloudflare, remote |
| Idempotency | 1 [R] | `mailport.js:188-288` uses `idempotencyKey` plus a fingerprint, and a durable outbox lookup | n/a | n/a | n/a |
| HTTP service | 1 [R] | `src/remote-service.js` serves `GET /health`, `/ready`, `/v1/status`; `POST/GET /v1/messages`, `GET /v1/messages/:id`, `/v1/messages/:id/events`; `/v1/domains[/:d[/verify|/dns]]`; `/v1/identities`; `/v1/suppressions`; `/v1/delivery-events`; `/v1/test/messages*`. Tests: `remote-service.test.js` "remote client talks to authenticated MailPort service", "remote service enforces auth" | `createMailPortService(mail, {apiKey, adminKey, operations, rateLimits, …})` | node http | Bearer API key with scopes `mail.send` / `mail.read`, plus admin keys |
| Remote client | 1 [R] | `src/remote-client.js` `createRemoteMailPortClient`. `createMailPort({transport:"remote"})` returns it (`mailport.js:98`). | `send`, `get`, `list`, `status`, `ops.{domains,identities,suppressions,events}`, `test.waitFor` | fetch | n/a |
| Templates | 1 [R] | `src/template-renderer.js`; `templates[name].{subject,html,text}` rendered with variables | n/a | n/a | Templates live in the **sender's** config, or the server's config for remote template sends |
| Identities and senders, domains, SPF and DKIM | 1 (tests found) | `src/operations.js`; tests `operations.test.js` "domains activate identities after DNS verification", "SPF verification …"; DKIM keys `signing-key-store.js` | `/v1/identities`, `/v1/domains` | n/a | In production, an unknown or inactive identity is refused (`remote-service.js:147-149`) |
| Suppression and rate limits | 1 [R] | `operations.test.js` "scoped keys isolate applications, suppression precedes acceptance, and limits return 429"; `production.test.js` "hard bounce is authoritative and suppresses future mail" | n/a | n/a | n/a |
| Delivery tracking | 1 (tests found) | Durable outbox `src/outbox.js` (`durability.test.js` "file store survives recreation and fences stale workers"), `/v1/messages/:id/events`, `delivery-events.js`, `process-restart.test.js` | n/a | n/a | n/a |
| Mail DSL (`use mail`) | 1 [R] | `src/dsl.js parseMailDsl` is regex based; test `dsl.test.js` "parseMailDsl parses identities and templates" | `parseMailDsl`, `generateMailContractSnapshot` | n/a | It is the same shape the AuthBoundry DSL parses (`parser.rs:355`) |
| OTP, magic link, challenge primitive | **5** [V] | grep for `otp`, `magic`, `challenge` and `one.time` finds nothing in `src` or `packages/*/src` | n/a | n/a | MailPort is transport only. The code or link must be generated and verified by the caller. |

### How FeltKit calls MailPort [V]

- **Code path.** `feltkit/packages/sdk/src/runtime/mail.ts` imports `createMailPort` from `mailerport` (`package.json` pins `"mailerport": ">=0.1.0 <1.0.0"`).
- **Production.** With `MAILPORT_URL` set, it calls `createMailPort({transport:"remote", remote:{baseUrl, apiKey}})`. That client sends `POST {MAILPORT_URL}/v1/messages` with `Authorization: Bearer` and an **explicit** payload `{identity, to, subject, text, html?, idempotencyKey, metadata}`. This is the `EmailMessage` from AppPort Services' `EmailNotificationChannel`.
- **Development.** Without `MAILPORT_URL`, development uses `transport:"memory"`, and production returns null so readiness fails.
- **Contract match.** The MailPort server accepts a non-template body (`remote-service.js:145`, `payload = body`) and resolves `identity` against registered identities.
- **Test.** `feltkit/packages/sdk/test/account-email.test.ts` "production sends through the Mailerport service at MAILPORT_URL, to the declared identity" asserts the path `/v1/messages`, the Bearer key, `identity:"auth"` and the `to` address. It uses a **fake HTTP server, not real MailPort**. The fake answers 202, while real MailPort answers 200.
- **Two contracts in use.** AuthBoundry's `RemoteMailPort` uses the *template* form (`{template, payload:{…,tenantId,variables}}`), while FeltKit uses the *explicit* form. Both are accepted by `/v1/messages`.

---

## 3. AppPort Services (`/home/user/rkendel1/appport-services`, `@appport/services@0.15.0`, ISC)

| Capability | Status | Evidence | Public API | Dependencies | Notes |
|---|---|---|---|---|---|
| API keys | 1 (tests found) | `src/api-keys/`; `tests/api-keys.test.ts` "creates key, returns secret once, persists hash and tenant, and carries no scopes" | `ApiKeyService`, `authenticateBearerToken` | FeltDB | Keys carry no scopes; AuthBoundry decides |
| Webhooks | 1 (tests found) | `src/webhooks/`; `webhooks.test.ts`, `webhooks-delivery.test.ts` | `WebhookService` | FeltDB | n/a |
| Jobs and schedules | 1 (tests found) | `src/jobs`, `src/schedules`; `jobs.test.ts` "tenant isolation prevents cross-tenant access" | `JobService`, `JobWorker`, `ScheduleService` | FeltDB | n/a |
| Configuration and secrets | 1 / 3 | `configuration.test.ts`; secrets are protocol only (`secrets.test.ts` "Secrets protocol is exported without an execution implementation") | `SecretsProtocol` types | n/a | Secrets are contract only (3) |
| Files | 1 (tests found) | `files.test.ts` "files enforce tenant and owner isolation through AuthBoundry" | `FileService` | FeltDB | n/a |
| Notifications plus e-mail channel | 1 (tests found) | `src/notifications/email.ts` `EmailNotificationChannel` (transport = "Mailerport's `send()`", idempotency key per delivery, `render()` at delivery time so signed links are never stored); `tests/notifications-email.test.ts` "a host channel: notifications are delivered by e-mail through a Mailerport-shaped transport", "render builds the message at delivery…", "no address fails for good; a transport error is retryable"; `notifications.test.ts` durable deliveries | `NotificationService`, `EmailNotificationChannel`, `NotificationChannelRegistry` | none on MailPort (structural typing) | **This is the intended path for auth e-mail.** FeltKit's `mail.ts` says "AppPort Services' notifications own the delivery; Mailerport is the transport". |
| Dedicated mail service | 5 [V] | `src/` contains api-keys, configuration, extensions, files, intelligence, jobs, notifications, schedules, secrets and webhooks, with no mail module | n/a | n/a | Mail is handled as a notification channel |
| Authorization | 3, interface only | `src/authority/authorizer.ts`: "AppPort Services ships no implementation: the host supplies an AuthBoundry client". `VerifiedPrincipal {principalId, principalType, tenantId, delegationId?, runId?}` in `authority/principal.ts` | `ServiceAuthorizationRequest/Decision` | The host's authorizer | FeltKit already supplies its own in-process `Authority` (`feltkit/packages/sdk/src/runtime/authority.ts:111`, used in `services.ts:316`). **No runtime AuthBoundry dependency is forced.** |

---

## 4. felt-ops (`/home/user/rkendel1/felt-ops`, "CompanyOS")

Notes on auth, mail and agents only:
- **Agents are FeltKit session principals.** Created with `npx feltkit session create --type agent --id … --role agent-*`. Each agent has a role list in `feltkit/app.ts:16-66`. `agents/runner.ts` calls `/mcp` with `Bearer AGENT_TOKEN`.
- **Agent authority is narrowed in application code.** `feltkit/_scope.ts` (`permissionsOf`, `grants`, `withinAssignment`, `CAPABILITY_PERMISSION`). Business authority lives in an `authorities` collection, because "FeltKit has no resource-attribute authorization".
- **Open gaps in `docs/FELTKIT-GAP-REPORT.md`:**
  - G-03, delegation primitive. Missing, "waits on AuthBoundry". Agents cannot sub-delegate.
  - G-04, per-task capability scopes for agent sessions. Missing.
  - G-06, resource-attribute authorization. Missing.
  - G-07, an agent control surface for the application.
  - G-01, account lifecycle.
  - G-02, session control.
  - G-08, durable decision evidence.
- **Account settings.** `auth: { accounts: { roles: ["staff"], signUp: false } }`, and there is no e-mail declared.

---

## 5. Reuse assessment for FeltKit auth and agent principals

**Constraint:** FeltKit must not depend at runtime on an external AuthBoundry control plane.

### FeltKit can reuse as semantics (port to TypeScript; these are the proven designs)

1. **The principal model.** `PrincipalKind {Human, Agent, Service}` plus an `AgentState` lifecycle where a non-active agent has no authority (`contract/src/principal.rs`).
2. **Delegation records.** `{delegator, delegate, tenant, capabilities[], resource_scope{type,id,attributes}, issued_at, expires_at, revoked_at, chain[]}` with `status_at(now)` (`contract/src/delegation.rs`).
3. **Attenuation at creation.** The delegator's evaluated envelope must allow every delegated capability. For an agent delegator, there must be a live parent delegation and the requested scope must satisfy `is_subset_of(parent)`. Human delegates are not allowed. Runs are task-scoped attenuations that cannot outlive or widen their delegation (`runtime/src/mesh.rs:724-1100`).
   - Consider adding a decision-time re-check of the delegator's authority, which AuthBoundry does not do.
4. **The evaluator shape.** Claims-based rules plus live delegations produce a `CapabilityEnvelope` with provenance (`authority: Claim|Delegated`, `delegation_chain`, `delegated_by`), and every mismatch fails closed (`authz/src/evaluator.rs`).
5. **The test matrix.** Port the cases in `runtime/tests/end_to_end_auth.rs` and `authz/tests/principal_delegation.rs` as FeltKit test cases. They map directly to G-03 and G-04.
6. **Agent credential lifecycle semantics.** A family with a hard end, scopes that only narrow, rotate-on-renew, replay revoking the family, and audit without secrets (`storage/src/agent_credential.rs`, `docs/AGENT-CREDENTIALS.md`).
7. **Email OTP design.** A 32-byte random code, state bound to tenant and email, single use (`providers/src/connectors/email.rs`). Add the TTL and attempt limit that AuthBoundry lacks.
8. **Delivery through AppPort Services and MailPort.** `EmailNotificationChannel` with a `render()` at delivery time, so codes and links are never stored. FeltKit already does this for verification and reset.
9. **The `use auth` grammar as a spec.** It is small: about 12 top-level keys, block, list and enum values, and `policy { cap { tenant=current resource=X claim=[…] } }`.

### FeltKit must implement itself

- **A DSL parser in TypeScript.** No WASM, N-API or JS build of `appport-auth-mesh-dsl` exists, the crates are not published, and the npm package is `UNLICENSED`.
  - Re-implementing the parser is straightforward [I]: about 1k lines of Rust, much of it validation. A re-implementation can also replace the substring-scanned sections with a real tokenizer.
  - The only alternative is a new WASM build of the `dsl` crate (serde only, so it would compile cleanly to `wasm32` [I]). That needs licensing and ownership agreement.
- **Delegation storage, evaluation and attenuation** in FeltKit's in-process `Authority` (`packages/sdk/src/runtime/authority.ts`). This closes G-03 and G-04.
- **Resource-attribute evaluation.** G-06. AuthBoundry's library supports it, but its application `enforce()` path does not.
- **Agent credentials**, unless FeltKit sessions with `--type agent` are extended to cover them.
- **Tenancy features.** Memberships (one identity in many tenants), invitations and tenant switching. AuthBoundry has none of these (status 5 or 4).
- **Auth flows:**
  - Email OTP or magic-link issuance and verification, with TTL and attempt limits. Neither AuthBoundry (not wired, no TTL) nor MailPort (no primitive) provides it.
  - Generic OIDC with PKCE, nonce and id_token checks. AuthBoundry's Google flow lacks these, and its OIDC entries are declared-only.

### Would create a forbidden runtime dependency

- `@authboundry/core` and `@authboundry/core/server` (`createAuthBoundry`, `createAuthBoundryEnforcer`, `enforce`, `check`, `effect`, `authorize`, `companies`, `principals`, `policies`). Every decision and every management call is an HTTP request to `authorityUrl`, with `abc_` and `aga_` credentials issued by the AuthBoundry server.
- `clients/js/authboundry.js`, the browser client. It calls `/auth/session` and `/auth/sign-in` on an AuthBoundry server.
- AuthBoundry agent credentials, check credentials, the control plane, organizations and application contracts. These live in the `server` crate and need FeltDB through `feltdb-adapter`.
- The `authboundry` CLI and native binary as a sidecar. It is a separate process even when local.
- Embedding the Rust `boundary` or `runtime` crates in-process would avoid the service dependency. However, it needs a Rust/N-API or WASM bridge that does not exist, and `providers` pulls in blocking reqwest, which does not build for WASM [I].

### MailPort and AppPort Services

These are acceptable and already in use:
- `mailerport` is an npm library. In development it runs in-process with the memory transport. In production it calls the operator's own MailPort service at `MAILPORT_URL`, which is the application's transport, not an AuthBoundry control plane.
- `@appport/services` notifications plus `EmailNotificationChannel` take a host-supplied authorizer, so FeltKit's own `Authority` satisfies them.
